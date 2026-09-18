import type { Itinerary } from "@/lib/itinerary";
import { extractLinks } from "@/lib/itinerary";

// Gera e baixa um PDF do roteiro, pra usar offline (sem depender de
// internet durante a viagem) — mesmo pedido que a Camila viu no Wonderplan.
// Importante: geramos o PDF inteiramente no navegador (biblioteca jsPDF,
// sem servidor), a partir do MESMO objeto `Itinerary` já estruturado que
// alimenta a tela — ou seja, não existe uma segunda fonte de verdade pra
// manter sincronizada; qualquer ajuste no roteiro (pelo chat) já reflete no
// PDF na próxima vez que a pessoa baixar.
//
// jsPDF não entende Markdown, então o texto das seções em prosa
// (documentação, hospedagem, restaurantes etc.) passa por `mdToPlain` antes
// de virar texto do PDF — isso tira **negrito**, [links](url) e cabeçalhos
// "##", sem o que apareceriam os símbolos crus no PDF.

function mdToPlain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type PdfCursor = { y: number };

const PAGE_MARGIN = 44;
const LINE_HEIGHT = 14;

// Layout muito simples de propósito: uma coluna, fonte padrão do jsPDF
// (Helvetica), sem imagens. O objetivo é um PDF leve e legível offline, não
// uma réplica visual da tela — Wonderplan também exporta em texto simples.
export async function downloadItineraryPdf(itinerary: Itinerary, destination: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - PAGE_MARGIN * 2;
  const cursor: PdfCursor = { y: PAGE_MARGIN };

  function ensureSpace(needed: number) {
    if (cursor.y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      cursor.y = PAGE_MARGIN;
    }
  }

  function addTitle(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    ensureSpace(28);
    doc.text(text, PAGE_MARGIN, cursor.y);
    cursor.y += 28;
  }

  function addSubtitle(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    ensureSpace(LINE_HEIGHT);
    doc.setTextColor(110, 110, 110);
    doc.text(text, PAGE_MARGIN, cursor.y);
    doc.setTextColor(20, 20, 20);
    cursor.y += LINE_HEIGHT + 10;
  }

  function addHeading(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    ensureSpace(LINE_HEIGHT + 10);
    cursor.y += 8;
    doc.text(text, PAGE_MARGIN, cursor.y);
    cursor.y += LINE_HEIGHT + 4;
  }

  function addSubheading(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    ensureSpace(LINE_HEIGHT + 4);
    doc.text(text, PAGE_MARGIN, cursor.y);
    cursor.y += LINE_HEIGHT + 2;
  }

  function addParagraph(text: string) {
    if (!text.trim()) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(mdToPlain(text), maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      doc.text(line, PAGE_MARGIN, cursor.y);
      cursor.y += LINE_HEIGHT;
    }
    cursor.y += 6;
  }

  function addBullet(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(mdToPlain(text), maxWidth - 14) as string[];
    lines.forEach((line, index) => {
      ensureSpace(LINE_HEIGHT);
      doc.text(index === 0 ? `•  ${line}` : `    ${line}`, PAGE_MARGIN, cursor.y);
      cursor.y += LINE_HEIGHT;
    });
  }

  function addLinksList(body: string, emptyLabel: string) {
    const links = extractLinks(body);
    if (links.length === 0) {
      addParagraph(emptyLabel);
      return;
    }
    doc.setFontSize(10.5);
    for (const link of links) {
      ensureSpace(LINE_HEIGHT);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 20);
      doc.text("•  ", PAGE_MARGIN, cursor.y);
      doc.setTextColor(37, 99, 235);
      doc.textWithLink(link.label, PAGE_MARGIN + 14, cursor.y, { url: link.url });
      doc.setTextColor(20, 20, 20);
      cursor.y += LINE_HEIGHT;
    }
    cursor.y += 6;
  }

  // --- Capa ---
  addTitle(`Roteiro de viagem — ${destination}`);
  addSubtitle(
    `Gerado pela Luna em ${new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`,
  );

  if (itinerary.documentacao) {
    addHeading("Documentação e requisitos");
    addParagraph(itinerary.documentacao);
  }

  if (itinerary.hospedagem) {
    addHeading("Hospedagem sugerida");
    addParagraph(itinerary.hospedagem);
  }

  if (itinerary.dias.length > 0) {
    addHeading("Roteiro dia a dia");
    for (const day of itinerary.dias) {
      addSubheading(day.title);
      for (const activity of day.activities) {
        addBullet(activity.text);
      }
      cursor.y += 4;
    }
  }

  if (itinerary.restaurantes) {
    addHeading("Restaurantes");
    addParagraph(itinerary.restaurantes);
  }

  const linkSections: Array<[string, string]> = (
    [
      ["Transporte", itinerary.linksTransporte],
      ["Hospedagem", itinerary.linksHospedagem],
      ["Passeios", itinerary.linksPasseios],
      ["Seguro viagem", itinerary.linksSeguro],
      ["Chip e internet", itinerary.linksChip],
      ["Transfer", itinerary.linksTransfer],
    ] as Array<[string, string]>
  ).filter(([, body]) => body.trim().length > 0);

  if (linkSections.length > 0) {
    addHeading("Links para reservas");
    for (const [label, body] of linkSections) {
      addSubheading(label);
      addLinksList(body, "Sem links.");
    }
  }

  if (itinerary.checklist.length > 0) {
    addHeading("Checklist personalizado");
    for (const item of itinerary.checklist) {
      addBullet(item);
    }
    cursor.y += 6;
  }

  if (itinerary.essencial) {
    addHeading("Essencial");
    addParagraph(itinerary.essencial);
  }

  if (itinerary.recomendacoes) {
    addHeading("Recomendações");
    addParagraph(itinerary.recomendacoes);
  }

  if (itinerary.dicas) {
    addHeading("Dicas finais da Luna");
    addParagraph(itinerary.dicas);
  }

  // Rodapé com número de página em todas as páginas.
  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(140, 140, 140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Luna Concierge de Viagens — página ${i} de ${pageCount}`,
      PAGE_MARGIN,
      pageHeight - 20,
    );
  }

  const fileSafeDestination = destination
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  doc.save(`roteiro-luna-${fileSafeDestination || "viagem"}.pdf`);
}
