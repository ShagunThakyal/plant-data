import { plantRouter } from "@/server/api/routers/plant";
import { reportRouter } from "@/server/api/routers/report";
import { sessionRouter } from "@/server/api/routers/session";
import { router } from "@/server/api/trpc";

export const appRouter = router({
	session: sessionRouter,
	plant: plantRouter,
	report: reportRouter,
});

export type AppRouter = typeof appRouter;
