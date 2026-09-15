import Link from "next/link";
import content from "@/lib/legal-content.json";
export function LegalDocument({ type }: { type: "privacy" | "terms" }) {
  const document = content[type];
  return <main className="legal-page"><Link href="/">← Volver a ONDIE</Link><article>
    <h1>{document.title}</h1><p className="legal-date">Actualizado: {content.updated}</p><p>{document.intro}</p>
    {document.sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
    <p><a href={`mailto:${content.contact}`}>{content.contact}</a></p>
  </article></main>;
}
