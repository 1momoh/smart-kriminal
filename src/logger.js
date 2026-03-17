// src/logger.js
import winston from "winston";
import chalk from "chalk";
import { mkdirSync } from "fs";

mkdirSync("logs", { recursive: true });

const fmt = winston.format.printf(({ level, message, timestamp }) => {
  const ts = chalk.gray(new Date(timestamp).toLocaleTimeString());
  const lvl = level === "info" ? chalk.cyan("[INFO]") : level === "warn" ? chalk.yellow("[WARN]") : chalk.red("[ERROR]");
  return ts + " " + lvl + " " + message;
});

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true })),
  transports: [
    new winston.transports.Console({ format: winston.format.combine(winston.format.timestamp(), fmt) }),
    new winston.transports.File({ filename: "logs/sniper.log", format: winston.format.json() }),
    new winston.transports.File({ filename: "logs/errors.log", level: "error", format: winston.format.json() }),
  ],
});
