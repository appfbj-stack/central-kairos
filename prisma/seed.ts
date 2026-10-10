import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@central-kairos.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Troque@Senha123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Fernando Borges";

interface SeedInstallation {
  productName: string;
  clientName: string;
  companyName?: string;
  appUrl: string;
  dbIdentifier?: string;
  status?: "TRIAL" | "ACTIVE" | "BLOCKED" | "EXPIRED" | "ARCHIVED";
  notes?: string;
}

const SEED: SeedInstallation[] = [
  {
    productName: "Kairos Igreja",
    clientName: "Igreja OBPC Sede",
    companyName: "OBPC Sede Sorocaba",
    appUrl: "https://igrejak.fbautomacao.space",
    dbIdentifier: "kairos_igreja_db_v2",
    status: "ACTIVE",
    notes: "Sistema multi-tenant de gestão eclesiástica. v2.11.0",
  },
  {
    productName: "Kairós Serviços",
    clientName: "Kairós Marketplace",
    companyName: "Kairos Serviços LTDA",
    appUrl: "https://servicos.fbautomacao.space",
    dbIdentifier: "kairos_servicos",
    status: "ACTIVE",
    notes: "Marketplace de serviços locais (Sorocaba/SP).",
  },
  {
    productName: "Kairos Política",
    clientName: "Assessoria Política",
    companyName: "Kairos Política",
    appUrl: "https://politica.fbautomacao.space",
    dbIdentifier: "kairos_politica",
    status: "ACTIVE",
    notes: "Gestão política com cadastro de eleitores e import CSV/XLSX.",
  },
  {
    productName: "Kairos Teologia",
    clientName: "Kairos Teologia",
    companyName: "Kairos Teologia",
    appUrl: "https://teologiakairos.fbautomacao.space",
    dbIdentifier: "teologia_kairos_db",
    status: "ACTIVE",
    notes: "Curso de Teologia Básico - 19 módulos, 192 capítulos.",
  },
  {
    productName: "Kairos CRM",
    clientName: "Kairos CRM",
    companyName: "Kairos Digital",
    appUrl: "https://crmkairos.fbautomacao.space",
    dbIdentifier: "supabase_crm_kairos",
    status: "ACTIVE",
    notes: "CRM multi-tenant com WhatsApp via Supabase.",
  },
  {
    productName: "Kairos Dental",
    clientName: "Kairos Dental",
    companyName: "Kairos Dental",
    appUrl: "https://dental.fbautomacao.space",
    dbIdentifier: "kairos_dental",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Esquadrilhas",
    clientName: "Kairos Esquadrilhas",
    appUrl: "https://esquadrilhas.fbautomacao.space",
    dbIdentifier: "kairos_esquadrilhas",
    status: "ACTIVE",
  },
  {
    productName: "Salão Jane",
    clientName: "Salão Jane",
    appUrl: "https://salaojane.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "FotoAgenda",
    clientName: "FotoAgenda",
    appUrl: "https://fotoagenda.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Almoxarifado",
    clientName: "Almoxarifado",
    appUrl: "https://almox.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Oficina",
    clientName: "Oficina",
    appUrl: "https://oficina.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Mecânica / Oficina Mecânica",
    clientName: "Oficina Mecânica",
    appUrl: "https://mecanica.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Sede Sorocaba",
    clientName: "Sede Sorocaba",
    appUrl: "https://sedesorocaba.fbautomacao.space",
    dbIdentifier: "kairos_sede_sorocaba",
    status: "ACTIVE",
  },
  {
    productName: "Vidro",
    clientName: "Vidro",
    appUrl: "https://vidro.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Imobiliária",
    clientName: "Imobiliária",
    appUrl: "https://imobiliaria.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Advocacia",
    clientName: "Advocacia",
    appUrl: "https://advocacia.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Assistente",
    clientName: "Kairos Assistente",
    appUrl: "https://assistente.fbautomacao.space",
    dbIdentifier: "kairos_assistant",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Chat AI (Kaichat)",
    clientName: "Kairos Chat",
    appUrl: "https://kaichat.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Atividades / Financeiro",
    clientName: "Kairos Atividades",
    appUrl: "https://atividades.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "QRCode Obreiros",
    clientName: "OBPC",
    appUrl: "https://qrcode.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Bíblia",
    clientName: "Bíblia",
    appUrl: "https://biblia.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Landing",
    clientName: "Kairos Landing",
    appUrl: "https://apps.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Leitor",
    clientName: "Leitor",
    appUrl: "https://leitor.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Lousa Digital",
    clientName: "Lousa Digital",
    appUrl: "https://lousa.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Engenharia (EngControl)",
    clientName: "EngControl",
    appUrl: "https://engcontrol.fbautomacao.space",
    dbIdentifier: "kairos_engenharia",
    status: "ACTIVE",
  },
  {
    productName: "Waha (WhatsApp)",
    clientName: "Waha",
    appUrl: "https://waha.fbautomacao.space",
    status: "ACTIVE",
    notes: "API WhatsApp self-hosted.",
  },
  {
    productName: "Evolution Go",
    clientName: "Evolution Go",
    appUrl: "https://evogo.fbautomacao.space",
    status: "ACTIVE",
    notes: "API WhatsApp alternativa.",
  },
  {
    productName: "Hermes Agent",
    clientName: "Hermes Agent",
    appUrl: "https://hermes.187.77.229.227.nip.io",
    status: "ACTIVE",
    notes: "Agente IA desktop.",
  },
  {
    productName: "Kairos Web",
    clientName: "Kairos Web",
    appUrl: "https://kairosweb.fbautomacao.space",
    status: "ACTIVE",
  },
  {
    productName: "Kairos Desktop (kairoscore)",
    clientName: "Kairos Desktop",
    appUrl: "https://kairosdesktop.fbautomacao.space",
    status: "ACTIVE",
    notes: "Agente IA desktop + update server.",
  },
  {
    productName: "Café / Sede",
    clientName: "Kairos Sede",
    appUrl: "https://sede.fbautomacao.space",
    status: "ACTIVE",
  },
];

async function main() {
  console.log("🌱 Seeding Central Kairos...");

  // 1) Admin user
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await prisma.adminUser.create({
      data: { email: ADMIN_EMAIL, passwordHash: hash, name: ADMIN_NAME },
    });
    console.log(`✅ Admin criado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`⚠️  TROQUE A SENHA NO PRIMEIRO LOGIN!`);
  } else {
    console.log(`⏭️  Admin já existe: ${ADMIN_EMAIL}`);
  }

  // 2) Installations
  const existing = await prisma.installation.findMany();
  console.log(`📦 ${existing.length} instalações já existem`);

  let nextNum = existing.length + 1;
  for (const item of SEED) {
    // Check se URL já existe (idempotência)
    const dup = existing.find((e) => e.appUrl === item.appUrl);
    if (dup) {
      console.log(`⏭️  ${dup.id} já existe (${item.productName})`);
      continue;
    }
    const id = `APP-${String(nextNum).padStart(4, "0")}`;
    await prisma.installation.create({
      data: {
        id,
        productName: item.productName,
        clientName: item.clientName,
        companyName: item.companyName || null,
        appUrl: item.appUrl,
        dbIdentifier: item.dbIdentifier || null,
        status: item.status || "ACTIVE",
        notes: item.notes || null,
      },
    });
    await prisma.installationStatusHistory.create({
      data: {
        installationId: id,
        fromStatus: null,
        toStatus: item.status || "ACTIVE",
        reason: "Seed inicial (criado pelo script de bootstrap)",
        changedBy: "system",
      },
    });
    console.log(`✅ ${id} - ${item.productName}`);
    nextNum++;
  }

  console.log("🎉 Seed concluído!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });