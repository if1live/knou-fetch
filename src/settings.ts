import dotenv from "dotenv";

dotenv.config({ debug: true });

export const credentials = {
  username: process.env.KNOU_USERNAME!,
  password: process.env.KNOU_PASSWORD!,
};
