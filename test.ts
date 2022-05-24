import * as fs from "fs";
import { NotionDoc } from "./callout";

(async () => {
  // const doc = new NotionDoc("cba6cbb96ae8419fbb5446f1f912faab");
  // const html = await doc.html();
  // fs.writeFileSync(
  //   "test.html",
  //   `<link rel="stylesheet" href="callout.css" />\n\n` + html
  // );

  const doc = new NotionDoc("063e9cd84f134b45916f4e41883f1220");
  const database = await doc.database();
  console.log(JSON.stringify(database, null, 2));
})();
