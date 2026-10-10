import { prisma } from "./prisma";

/**
 * Gera o próximo ID sequencial no formato APP-0001, APP-0002, ...
 * Como o ID é PK string, geramos no app code buscando o maior existente.
 *
 * OBS: em produção concorrente pode haver race condition entre dois POSTs
 * simultâneos. Pra Central Kairos (uso interno, baixo tráfego), é aceitável.
 * Se virar problema, usar SELECT ... FOR UPDATE ou sequence do Postgres.
 */
export async function nextInstallationId(): Promise<string> {
  const last = await prisma.installation.findFirst({
    where: { id: { startsWith: "APP-" } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const nextNum = last ? parseInt(last.id.replace("APP-", ""), 10) + 1 : 1;
  return `APP-${String(nextNum).padStart(4, "0")}`;
}