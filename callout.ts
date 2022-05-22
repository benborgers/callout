import { Client } from "@notionhq/client";
import type { GetBlockResponse } from "@notionhq/client/build/src/api-endpoints";
import { html_beautify } from "js-beautify";

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
    return html_beautify(await this.#blockToHtml(this.#_id));
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
      const src =
        block.image.type === "file"
          ? block.image.file.url
          : block.image.type === "external"
          ? block.image.external.url
          : "";

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
    }

    console.log(`Unsupported block`, block);
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

        if (object.text.link) {
          objectHtml = `<a href="${object.text.link.url}">${objectHtml}</a>`;
        }
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

      html.push(objectHtml);
    }

    return html.join("");
  }
}
