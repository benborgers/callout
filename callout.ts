import { Client } from "@notionhq/client";
import type { GetBlockResponse } from "@notionhq/client/build/src/api-endpoints";
import { html_beautify } from "js-beautify";
import { fetch } from "undici";
import { writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";

// It's ok to include this because it can only read content it's shared with,
// and does not have access to user information.
const NOTION_TOKEN = "secret_b9zKgreYmLmPusMEhPtuRjLTZRcfmNIzyPu0NmPE1rr";

const notion = new Client({ auth: NOTION_TOKEN });

type Block = Extract<GetBlockResponse, { type: string }>;
type BlockParagraph = Extract<GetBlockResponse, { type: "paragraph" }>;
type RichText = BlockParagraph["paragraph"]["rich_text"][0];

export class NotionDoc {
  #_id;
  #_cache: { [key: string]: Block } = {};

  constructor(id: string) {
    this.#_id = this.#normalizeId(id);
  }

  #normalizeId(id: string) {
    return `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(
      12,
      16
    )}-${id.substring(16, 20)}-${id.substring(20)}`;
  }

  async #block(blockId: string): Promise<Block> {
    if (this.#_cache[blockId]) {
      return this.#_cache[blockId];
    }

    const block = (await notion.blocks.retrieve({
      block_id: blockId,
    })) as Block;

    this.#_cache[blockId] = block;

    return block;
  }

  async #children(blockId: string): Promise<Block[]> {
    const blocks = (
      await notion.blocks.children.list({
        block_id: blockId,
        page_size: 100,
      })
    ).results as Block[];

    blocks.forEach((block) => {
      if (!this.#_cache[block.id]) {
        this.#_cache[block.id] = block;
      }
    });

    return blocks;
  }

  async html() {
    const output = (await this.#blockToHtml(this.#_id))
      .replace(/<\/ol><ol>/g, "")
      .replace(/<\/ul><ul>/g, "");
    return html_beautify(output);
  }

  async #blockToHtml(blockId: string): Promise<string> {
    const block = await this.#block(blockId);

    if (block.type === "child_page") {
      if (block.has_children) {
        return this.#blockChildrenToHtml(block.id);
      }

      return "";
    }

    if (block.type === "paragraph") {
      let html = `<p>${await this.#richTextToHtml(
        block.paragraph.rich_text
      )}</p>`;

      if (block.has_children) {
        html += `<div class="callout--indent">
            ${await this.#blockChildrenToHtml(block.id)}
          </div>`;
      }

      return html;
    } else if (block.type === "heading_1") {
      return `<h1>${await this.#richTextToHtml(
        block.heading_1.rich_text
      )}</h1>`;
    } else if (block.type === "heading_2") {
      return `<h2>${await this.#richTextToHtml(
        block.heading_2.rich_text
      )}</h2>`;
    } else if (block.type === "heading_3") {
      return `<h3>${await this.#richTextToHtml(
        block.heading_3.rich_text
      )}</h3>`;
    } else if (block.type === "image") {
      let src =
        block.image.type === "file"
          ? block.image.file.url
          : block.image.type === "external"
          ? block.image.external.url
          : "";

      if (block.image.type === "file") {
        src = await this.#persistentSrc(src);
      }

      return `<figure>
            <img src="${src}" />${
        block.image.caption.length > 0
          ? `<figcaption>${await this.#richTextToHtml(
              block.image.caption
            )}</figcaption>`
          : ""
      }
        </figure>`;
    } else if (block.type === "column_list") {
      const columns = await this.#children(block.id);
      return `<div class="callout--columns" style="--callout-columns-count: ${
        columns.length
      }">${await this.#blockChildrenToHtml(block.id)}</div>`;
    } else if (block.type === "column") {
      return `<div>${await this.#blockChildrenToHtml(block.id)}</div>`;
    } else if (
      block.type === "numbered_list_item" ||
      block.type === "bulleted_list_item"
    ) {
      const el = {
        numbered_list_item: "ol",
        bulleted_list_item: "ul",
      }[block.type];

      return `<${el}><li>${await this.#richTextToHtml(
        block.type === "numbered_list_item"
          ? block.numbered_list_item.rich_text
          : block.type === "bulleted_list_item"
          ? block.bulleted_list_item.rich_text
          : []
      )}</li>${
        block.has_children ? await this.#blockChildrenToHtml(block.id) : ""
      }</${el}>`;
    }

    console.log("Unsupported block in Callout", block);
    return "";
  }

  async #blockChildrenToHtml(blockId: string): Promise<string> {
    const html: string[] = [];

    for (const child of await this.#children(blockId)) {
      html.push(await this.#blockToHtml(child.id));
    }

    return html.join("");
  }

  async #richTextToHtml(objects: RichText[]): Promise<string> {
    const html: string[] = [];

    for (const object of objects) {
      let objectHtml = "";

      if (object.type === "text") {
        objectHtml = object.text.content;
      }

      if (object.annotations.bold) {
        objectHtml = `<strong>${objectHtml}</strong>`;
      }

      if (object.annotations.italic) {
        objectHtml = `<em>${objectHtml}</em>`;
      }

      if (object.annotations.strikethrough) {
        objectHtml = `<s>${objectHtml}</s>`;
      }

      if (object.annotations.underline) {
        objectHtml = `<span class="callout--underline">${objectHtml}</span>`;
      }

      if (object.annotations.code) {
        objectHtml = `<code>${objectHtml}</code>`;
      }

      if (object.annotations.color) {
        // TODO: colors
      }

      if (object.type === "text" && object.text.link) {
        objectHtml = `<a href="${object.text.link.url}">${objectHtml}</a>`;
      }

      html.push(objectHtml);
    }

    return html.join("");
  }

  async #persistentSrc(url: string) {
    if (process.env.NODE_ENV === "development") {
      return url;
    }

    const urlWithoutQuery = url.split("?")[0];
    const hash = createHash("sha1").update(urlWithoutQuery).digest("hex");
    const extension = urlWithoutQuery.split(".").pop();
    const filename = `${hash}.${extension}`;

    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buffer) =>
        writeFileSync(`./dist/${filename}`, Buffer.from(buffer))
      );

    return `/${filename}`;
  }
}
