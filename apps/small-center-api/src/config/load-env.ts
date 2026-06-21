import dotenv from "dotenv";
import path from "node:path";

const appEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: appEnvPath, override: true });
