import { chromium, Page } from "playwright";
import { download } from "@perillamint/node-hls-downloader";
import * as settings from "./settings.js";

const cntsId = process.argv[2];

// KNOU1573
const re_cntsId = /KNOU\d{4}/;
if (!re_cntsId.test(cntsId)) {
  throw new Error("invalid ctnsId: valid format is KNOU1234");
}

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

interface Lecture {
  title: string;
  script: string;
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

  const subject = await popup.innerText(".header-subject");

  const weeklyText = await popup.innerText(".header-weekly span");
  const weekly = parseInt(weeklyText.replace("강.", ""), 10);

  // 오리엔테이션이 붙는 경우, 페이지에 강의가 2개가 될수 있다.
  // 또는 강의 1개가 여러개고 쪼개진 경우도 있다.
  const scriptElements = await popup.$$("#content script");
  const promises = scriptElements.map(async (element) => {
    const script = await element.innerHTML();
    const lines = script.split("\n").map((x) => x.trimStart());

    const line_hls = lines.find((x) => x.startsWith(`"hlsUrl"`)) ?? "";
    const re_url = /"(https:.+)"/;
    const url_hls = re_url.exec(line_hls)![1];
    return url_hls;
  });
  const urls = await Promise.all(promises);

  const actions = urls.map((url_hls, idx) => {
    const a = weekly.toString().padStart(2, "0");
    const b = idx + 1;
    const filename = `${subject}-${a}-${b}.mp4`;
    return {
      subject,
      weekly,
      url_hls,
      filename,
    };
  });

  // 강의 페이지 열려있는 동안에 받는게 안전할듯
  for (const action of actions) {
    console.log(`${action.filename}`);
    await download({
      quality: "best",
      concurrency: 10,
      outputFile: action.filename,
      streamUrl: action.url_hls,
    });
  }

  await popup.close();
}

await signIn(page, settings.credentials);

await gotoLecture(page, cntsId);
const lectures = await extractLectureList(page);

// 중간 다운로드 할때 건드리기
for (let i = 0; i < lectures.length; i++) {
  await openLecturePopup(page, i);
}

await page.close();

process.exit();
