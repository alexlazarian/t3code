import { createFileRoute } from "@tanstack/react-router";

import { OverviewView } from "../components/overview/OverviewView";

export const Route = createFileRoute("/_chat/overview")({
  component: OverviewView,
});
