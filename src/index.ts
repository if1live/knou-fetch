import { chromium, Page } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as settings from "./settings.js";
import { Lecture, parseScript } from "./helpers.js";

const browser = await chromium.launch({
  headless: false,
  args: ["--disable-dev-shm-usage"],
});

const context = await browser.newContext({});
const page = await context.newPage();

const host = "https://ucampus.knou.ac.kr";

async function signIn(
  page: Page,
  credentials: {
    username: string;
    password: string;
  }
) {
  const path = `/ekp/user/login/retrieveULOLogin.do`;
  await page.goto(`${host}${path}`);

  await page.type("input[name=username]", credentials.username);
  await page.type("input[name=password]", credentials.password);
  await page.click("button[type=submit]");
}

async function gotoLecture(page: Page, cntsId: string) {
  const qs = new URLSearchParams({
    cntsId: cntsId,
    sbjtId: `${cntsId}001`,
    tabNo: "02",
  }).toString();

  await page.goto(`${host}/ekp/user/course/initUCRCourse.sdo?${qs}`);
  await page.click(".tab-menu li:nth-child(2)");
}

async function extractLectureList(page: Page): Promise<Lecture[]> {
  const lectures = [];
  const elements = await page.$$(".lecture-content-item");
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]!;
    const titleNode = await element.$(".lecture-title");
    const title = await titleNode?.innerText();

    // 로그인해야 보이는 버튼
    const buttonNode = await page.$(`#sequens${i}`);
    const script = await buttonNode?.getAttribute("onclick");

    const result: Lecture = {
      title: title!,
      script: script!,
    };
    lectures.push(result);
  }
  return lectures;
}

// await page.close();

// process.exit();

await signIn(page, settings.credentials);

await gotoLecture(page, settings.cntsId);
const lectures = await extractLectureList(page);
const list = lectures.map((x) => parseScript(x.script));
console.log(list);
