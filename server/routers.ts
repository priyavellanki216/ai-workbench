import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const demoMetrics = {
  groundedness: 94.2,
  citationAccuracy: 98.7,
  medianLatencyMs: 2400,
  source: "seeded-demo-snapshot",
} as const;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  workspace: router({
    demoSnapshot: publicProcedure.query(() => demoMetrics),
    conversations: protectedProcedure.query(({ ctx }) => ({
      ownerId: ctx.user.id,
      items: [],
      note: "Connect the conversation query to the conversations table for persisted workspace data.",
    })),
    createConversation: protectedProcedure
      .input(z.object({ title: z.string().min(1).max(240) }))
      .mutation(({ ctx, input }) => ({
        accepted: true,
        createdBy: ctx.user.id,
        title: input.title,
        next: "Persist with conversations.insert() and return the generated id.",
      })),
  }),
  feedback: router({
    create: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive(), rating: z.enum(["up", "down"]), category: z.string().max(80).optional(), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => ({
        accepted: true,
        userId: ctx.user.id,
        ...input,
        next: "Persist with feedback.insert() and emit a feedback.created analytics event.",
      })),
  }),
});

export type AppRouter = typeof appRouter;
