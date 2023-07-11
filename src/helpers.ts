export interface Lecture {
  title: string;
  script: string;
}

export interface Display {
  pSbjtId: string;
  pLectPldcTocNo: string;
  pAtlcNo: "";
  pTmpCode: string;
}

export function parseScript(script: string): Display {
  const re = /fnCntsTmpPopup\('(.+)', '(.+)', '(.+)'\); return false;/;
  const m = re.exec(script);
  if (!m) {
    throw new Error("cannot parse script");
  }

  return {
    pSbjtId: m[1],
    pLectPldcTocNo: m[2],
    pAtlcNo: "",
    pTmpCode: m[3],
  };
}
