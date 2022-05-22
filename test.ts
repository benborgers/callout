import * as fs from "node:fs";
import { NotionDoc } from "./callout";

(async () => {
  const doc = new NotionDoc("cba6cbb96ae8419fbb5446f1f912faab");
  const html = await doc.html();
  fs.writeFileSync(
    "test.html",
    `<link rel="stylesheet" href="callout.css" />\n\n` + html
  );
})();
