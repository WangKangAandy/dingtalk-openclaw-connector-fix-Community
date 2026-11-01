import { parseCardCallbackFrame, resolveCardFeedbackAction } from "./parse.ts";
import { recordCardFeedback } from "./record.ts";
import { buildCardFeedbackAck, buildEmptyCardAck, CARD_CALLBACK_PARSE_FAILURE } from "./response.ts";
import type { CardSessionStore } from "./session-map.ts";
import {
  CARD_CALLBACK_TOPIC,
  resolveCardFeedbackConfig,
  type CardCallbackListener,
  type CardFeedbackClient,
  type CardFeedbackConfig,
  type CardFeedbackLog,
} from "./types.ts";

export type AttachCardFeedbackOpts = {
  client: CardFeedbackClient;
  config?: CardFeedbackConfig;
  topic?: string;
  store?: CardSessionStore;
  log?: CardFeedbackLog;
  logPath?: string;
};

export function createCardCallbackListener(opts: AttachCardFeedbackOpts): CardCallbackListener {
  const resolved = resolveCardFeedbackConfig(opts.config);
  return (res) => {
    const messageId = res.headers?.messageId;
    const respond = (body: unknown) => {
      if (!messageId) return;
      try {
        opts.client.socketCallBackResponse(messageId, body);
      } catch (err) {
        opts.log?.warn?.(
          `[card-feedback] callback ack failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    try {
      const frame = parseCardCallbackFrame(res);
      if (!frame) {
        respond(CARD_CALLBACK_PARSE_FAILURE);
        return;
      }
      const action = resolveCardFeedbackAction(frame, resolved);
      if (!action) {
        respond(buildEmptyCardAck());
        return;
      }

      // Prefer local append within the callback window, then ACK.
      // ACK only means DingTalk received our response — not that analysis has run.
      const saved = recordCardFeedback(action, {
        store: opts.store,
        log: opts.log,
        logPath: opts.logPath,
        eventId: frame.messageId ?? action.eventId,
      });
      if (!saved) {
        opts.log?.error?.(
          `[card-feedback] persist failed before ack for card=${action.outTrackId}`,
        );
      }
      respond(buildCardFeedbackAck(action, resolved));
    } catch (err) {
      opts.log?.error?.(
        `[card-feedback] callback handler failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      respond(CARD_CALLBACK_PARSE_FAILURE);
    }
  };
}

export function attachCardFeedback(opts: AttachCardFeedbackOpts): { detach: () => void } {
  const topic = opts.topic ?? CARD_CALLBACK_TOPIC;
  const listener = createCardCallbackListener(opts);
  opts.client.registerCallbackListener(topic, listener);
  opts.log?.info?.(`[card-feedback] listening on ${topic}`);
  return {
    detach() {
      try {
        opts.client.deregisterCallbackListener?.(topic, listener);
      } catch (err) {
        opts.log?.warn?.(
          `[card-feedback] detach failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}
