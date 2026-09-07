import { createFileRoute } from "@tanstack/react-router";
import { BoxingGame } from "@/components/game/BoxingGame";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Keystroke Knockout — 3D Typing Boxing Duel" },
      {
        name: "description",
        content:
          "Enter a room code and box a friend in 3D: type words fast and clean to land jabs, hooks and haymakers until one fighter drops.",
      },
      { property: "og:title", content: "Keystroke Knockout — 3D Typing Boxing Duel" },
      {
        property: "og:description",
        content:
          "Two players, one room code. Fast, accurate typing turns into combo punches in a 3D boxing ring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BoxingGame,
});
