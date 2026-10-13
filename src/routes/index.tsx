import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Meu Controle Financeiro" },
      { name: "description", content: "Controle receitas, despesas e orçamentos com os dados no Google Sheets." },
      { property: "og:title", content: "Meu Controle Financeiro" },
      { property: "og:description", content: "Controle receitas, despesas e orçamentos com os dados no Google Sheets." },
    ],
  }),
});
