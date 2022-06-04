import * as fs from "fs";
import { NotionDoc } from "./callout";

(async () => {
  // const doc = new NotionDoc("5f7e97761ad1461fa6040c2c6c665158");
  // const html = await doc.html();
  // fs.writeFileSync(
  //   "test.html",
  //   `<link rel="stylesheet" href="callout.css" />\n\n` + html
  // );

  const doc = new NotionDoc("7318bc3169a54478a349b0ba5fc35209");
  const database = await doc.database();
  console.log(JSON.stringify(database, null, 2));
})();
