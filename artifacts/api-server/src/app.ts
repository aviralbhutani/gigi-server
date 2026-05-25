import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import webhookRouter from "./routes/webhook";
import sendBotRouter from "./routes/sendBot";
import toolCallRouter from "./routes/toolCall";
import screenRouter from "./routes/screen";
import healthRouter from "./routes/health";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(webhookRouter);   // POST /webhook
app.use(sendBotRouter);   // POST /send-bot, POST /remove-bot
app.use(toolCallRouter);  // POST /tool-call
app.use(screenRouter);    // GET /screen, GET /screenshot.jpg
app.use(healthRouter);    // GET /healthz

export default app;
