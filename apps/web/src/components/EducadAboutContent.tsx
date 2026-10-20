"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Box, Check, Code2, FolderOpen, Globe, GraduationCap, History, MessageCircle, PencilRuler, Ruler, School, Server, ShieldCheck, Sparkles, Tablet, UserRound } from "lucide-react";
import { aboutContent } from "@/lib/aboutContent";
import type { EducadLocale } from "@/lib/educadI18n";

const featureIcons = [Box, PencilRuler, Ruler, FolderOpen];
const essentialIcons = [Code2, UserRound, Globe, Tablet, FolderOpen, Server];
const illustrationPath = "/assets/educad/about/";

export function EducadAboutContent({ locale, preview, onStart, onOpenChallenges }: { locale: EducadLocale; preview?: string; onStart: () => void; onOpenChallenges: () => void }) {
  const [featureIndex, setFeatureIndex] = useState(0);
  const text = aboutContent[locale];
  const feature = text.featureGroups[featureIndex];
  return <>
    <section id="top" className="about-hero about-container">
      <div className="about-hero-copy">
        <span className="about-eyebrow"><span className="about-live-dot" />{text.eyebrow}</span>
        <h1>{text.heroTitle}<br /><em>{text.heroAccent}</em></h1>
        <p>{text.heroDescription}</p>
        <div className="about-hero-actions"><button className="about-button primary" type="button" onClick={onStart}>{text.start}<ArrowRight size={18} /></button><a className="about-text-link" href="#challenges">{text.explore}<ArrowRight size={16} /></a></div>
        <small><ShieldCheck size={16} />{text.heroNote}</small>
      </div>
      <div className="about-hero-visual">
        <figure className="about-model-image"><img src={preview || `${illustrationPath}model.svg`} width="1200" height="900" alt={preview ? text.yourModel : text.modelAlt} fetchPriority="high" decoding="async" /><figcaption>{preview ? text.yourModel : text.illustration}</figcaption></figure>
        <div className="about-history-note"><span className="about-icon-tile"><History size={20} /></span><div><strong>{text.historyTitle}</strong><p>{text.historyDescription}</p><ol>{text.history.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}<Check size={13} /></li>)}</ol></div></div>
        <span className="about-visual-index" aria-hidden="true">x / y / z</span>
      </div>
    </section>
    <div className="about-essentials"><div className="about-container">{text.essentials.map((item, index) => { const Icon = essentialIcons[index]; return <span key={item}><Icon size={18} />{item}</span>; })}</div></div>

    <section id="learning" className="about-learning about-container about-section">
      <div className="about-section-heading"><span className="about-eyebrow">{text.learningEyebrow}</span><h2>{text.learningTitle}<br /><em>{text.learningAccent}</em></h2><p>{text.learningDescription}</p></div>
      <div className="about-audience-grid">
        <article className="about-audience-card"><span className="about-icon-tile"><PencilRuler size={23} /></span><h3>{text.studentTitle}</h3><p>{text.studentDescription}</p><ul>{text.studentPoints.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></article>
        <article className="about-audience-card teacher"><span className="about-icon-tile"><GraduationCap size={25} /></span><h3>{text.teacherTitle}</h3><p>{text.teacherDescription}</p><ul>{text.teacherPoints.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul><button type="button" className="about-text-link" onClick={onOpenChallenges}>{text.openChallenges}<ArrowRight size={17} /></button></article>
        <figure className="about-sketch-figure"><img src={`${illustrationPath}sketch.svg`} width="1000" height="760" alt={text.sketchAlt} loading="lazy" decoding="async" /><figcaption>{text.sketchCaption}</figcaption></figure>
      </div>
    </section>

    <section id="features" className="about-feature-section about-section">
      <div className="about-container">
        <div className="about-section-heading"><span className="about-eyebrow">{text.featureEyebrow}</span><h2>{text.featureTitle}<br /><em>{text.featureAccent}</em></h2><p>{text.featureDescription}</p></div>
        <div className="about-feature-tabs" role="tablist" aria-label={text.navigation[2]}>{text.featureGroups.map((group, index) => { const Icon = featureIcons[index]; return <button key={group.title} type="button" id={`about-tab-${index}`} role="tab" aria-selected={featureIndex === index} aria-controls="about-feature-panel" tabIndex={featureIndex === index ? 0 : -1} onClick={() => setFeatureIndex(index)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % featureIcons.length : event.key === "ArrowLeft" ? (index + featureIcons.length - 1) % featureIcons.length : event.key === "Home" ? 0 : event.key === "End" ? featureIcons.length - 1 : null;
          if (next !== null) { event.preventDefault(); setFeatureIndex(next); document.getElementById(`about-tab-${next}`)?.focus(); }
        }}><Icon size={18} /><span>{group.title}</span></button>; })}</div>
        <div className="about-feature-panel" id="about-feature-panel" role="tabpanel" aria-labelledby={`about-tab-${featureIndex}`} tabIndex={0}>
          <div><h3>{feature.heading}</h3><p>{feature.description}</p><ul>{feature.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul></div>
          <img src={`${illustrationPath}${feature.image}`} width="1000" height="760" alt={feature.alt} loading="lazy" decoding="async" />
        </div>
      </div>
    </section>

    <section id="challenges" className="about-challenges about-section">
      <div className="about-container about-challenge-layout">
        <div className="about-challenge-copy"><span className="about-eyebrow"><GraduationCap size={18} />{text.challengeEyebrow}</span><h2>{text.challengeTitle}<br /><em>{text.challengeAccent}</em></h2><p>{text.challengeDescription}</p><ol>{text.challengeSteps.map((item, index) => <li key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.description}</p></div></li>)}</ol><button className="about-button light" type="button" onClick={onOpenChallenges}>{text.openChallenges}<ArrowRight size={18} /></button></div>
        <figure className="about-challenge-figure"><div className="about-challenge-demo"><header><BookOpen size={20} /><span>{text.challengeWindow}</span><span>2 / 4</span></header><div className="about-challenge-demo-content"><small>{text.challengeStep}</small><h3>{text.challengeName}</h3><p>{text.challengeInstruction}</p><div className="about-challenge-values"><span>{text.challengeParameter}<b>5 mm</b></span><span>{text.challengeParameter2}<b>3 mm</b></span></div><img src={`${illustrationPath}challenge.svg`} width="1000" height="700" alt={text.featureGroups[3].alt} loading="lazy" decoding="async" /><div className="about-demo-navigation" aria-hidden="true"><span>{text.previous}</span><span>{text.next}<ArrowRight size={14} /></span></div></div></div><figcaption>{text.challengeCaption}</figcaption></figure>
      </div>
    </section>

    <section className="about-privacy about-container about-section"><div className="about-privacy-symbol" aria-hidden="true"><ShieldCheck size={50} strokeWidth={1.4} /><span /><span /></div><div><span className="about-eyebrow">{text.privacyEyebrow}</span><h2>{text.privacyTitle}</h2><p>{text.privacyDescription}</p><ul>{text.privacyPoints.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div></section>

    <section id="community" className="about-community about-section"><div className="about-container"><div className="about-section-heading"><span className="about-eyebrow">{text.communityEyebrow}</span><h2>{text.communityTitle}</h2><p>{text.communityDescription}</p></div><div className="about-community-grid"><article className="about-school"><span className="about-school-icon"><School size={46} strokeWidth={1.4} /></span><div><small>{text.institutionType}</small><h3>{text.institution}</h3><p>{text.institutionNote}</p></div></article><article className="about-school-invitation"><h3>{text.joinTitle}</h3><p>{text.joinDescription}</p><span>{text.contactPending}</span></article></div></div></section>

    <section id="stories" className="about-stories about-container about-section"><div className="about-story-graphic" aria-hidden="true"><span><MessageCircle size={44} strokeWidth={1.4} /></span><i /><i /><Sparkles size={26} /></div><div><span className="about-eyebrow">{text.storiesEyebrow}</span><h2>{text.storiesTitle}<br /><em>{text.storiesAccent}</em></h2><p>{text.storiesDescription}</p><span className="about-coming-soon">{text.comingSoon}</span></div></section>

    <section className="about-final"><div className="about-container"><div><h2>{text.finalTitle}</h2><p>{text.finalDescription}</p></div><button className="about-button light" type="button" onClick={onStart}>{text.start}<ArrowRight size={19} /></button></div></section>
    <footer className="about-footer about-container"><div><strong><img src="/assets/educad/logo.svg" width="34" height="34" alt="" />eduCAD</strong><p>{text.footer}</p></div><div><a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer">{text.documentation}<ArrowRight size={14} /></a><small>{text.credit}</small></div></footer>
  </>;
}
