import { chromium, Page } from "playwright";
import { download } from "@perillamint/node-hls-downloader";
import { setTimeout as delay } from "node:timers/promises";
import * as settings from "./settings.js";
import { Lecture, parseScript } from "./helpers.js";

const browser = await chromium.launch({
  headless: false,
  args: ["--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  acceptDownloads: true,
});
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

async function openLecturePopup(page: Page, sequence: number) {
  const popupPromise = page.waitForEvent("popup");

  const buttonNode = await page.$(`#sequens${sequence}`);
  await buttonNode?.click();

  const popup = await popupPromise;
  await popup.waitForLoadState();

  // 오리엔테이션이 붙는 경우, 페이지에 강의가 2개가 될수 있다. 마지막 강의를 선택
  const script = await popup.innerHTML("#content script:last-of-type");
  const lines = script.split("\n").map((x) => x.trimStart());

  const line_hls = lines.find((x) => x.startsWith(`"hlsUrl"`)) ?? "";
  const line_rtmp = lines.find((x) => x.startsWith(`"rtmpUrl"`)) ?? "";
  const line_http = lines.find((x) => x.startsWith(`"httpUrl"`)) ?? "";

  const re_url = /https:\/\/[a-zA-Z0-9./?=-]+/;

  const url_hls = re_url.exec(line_hls)![0];
  const url_rtmp = re_url.exec(line_rtmp)![0];
  const url_http = re_url.exec(line_http)![0];

  // hls 즉시 받기는 안되는데 일정시간 기다렸다 하니까 되더라. 뒤쪽에서 뭔가 돌아가는듯?
  await delay(5000);

  return [popup, url_hls] as const;
}

await signIn(page, settings.credentials);

await gotoLecture(page, settings.cntsId);
const lectures = await extractLectureList(page);
const list = lectures.map((x) => {
  const link = parseScript(x.script);
  return { title: x.title, link };
});

for (let i = 0; i < list.length; i++) {
  const title = list[i].title;
  const [popup, streamUrl] = await openLecturePopup(page, i);

  const order = (i + 1).toString().padStart(2, "0");
  const filename = `${settings.title}-${order}.mp4`;

  console.log(`${title} - ${filename}`);
  console.log(streamUrl);

  await download({
    quality: "best",
    concurrency: 10,
    outputFile: filename,
    streamUrl: streamUrl,
  });

  await popup.close();
}

await page.close();
