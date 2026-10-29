import { createFileRoute } from "@tanstack/react-router";

import { ContextPage } from "../components/context/ContextPage";

export const Route = createFileRoute("/_chat/settings/context")({ component: ContextPage });
