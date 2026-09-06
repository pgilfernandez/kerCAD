"use client";

import { ArrowRight, Box, Braces, DraftingCompass, Github, GraduationCap, History, MousePointer2, PencilRuler, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  projectCount: number;
  preview?: string;
  onStart: () => void;
};

const features = [
  { icon: History, title: "Real parametric history", copy: "Every shape and CAD operation remains ordered, editable, and rebuildable." },
  { icon: PencilRuler, title: "Sketch, constrain, build", copy: "Draw precise 2D profiles, add constraints, then extrude or revolve them into solids." },
  { icon: MousePointer2, title: "Direct visual editing", copy: "Move, rotate, resize, align, and snap with approachable handles directly in the viewport." },
  { icon: Box, title: "Professional geometry", copy: "OpenCascade B-Rep powers booleans, fillets, chamfers, shells, STEP, and STL export." },
  { icon: ShieldCheck, title: "Local by default", copy: "Projects stay in your browser. No account, subscription, or cloud upload is required." },
  { icon: GraduationCap, title: "Designed for learning", copy: "A calm interface introduces CAD concepts without hiding how a model is constructed." },
];

export function EducadLandingPage({ projectCount, preview, onStart }: Props) {
  return <main className="educad-landing">
    <header className="educad-landing-nav">
      <a className="educad-landing-brand" href="#top" aria-label="eduCAD home"><img src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></a>
      <nav aria-label="Main navigation"><a href="#features">Features</a><a href="#workflow">How it works</a><a href="#education">Education</a></nav>
      <button type="button" onClick={onStart}>{projectCount ? "Open projects" : "Start designing"}<ArrowRight size={18} /></button>
    </header>

    <section className="educad-landing-hero" id="top">
      <div className="educad-landing-hero-copy">
        <span className="educad-landing-kicker"><Sparkles size={16} /> Open-source parametric CAD</span>
        <h1>Ideas become precise, editable 3D models.</h1>
        <p>eduCAD brings a simple, visual workflow to real parametric modelling—made for classrooms, makers, and anyone learning how CAD works.</p>
        <div className="educad-landing-actions">
          <button className="primary" type="button" onClick={onStart}>Start designing <ArrowRight size={19} /></button>
          <a href="#features">Explore features</a>
        </div>
        <small>No account · Runs locally · Free and open source</small>
      </div>
      <div className="educad-landing-product-shot" aria-label="eduCAD editor preview">
        <div className="landing-window-bar"><span /><span /><span /><strong>eduCAD — Parametric design</strong></div>
        <div className="landing-editor-shot">
          <aside><i /><i /><i /><i /></aside>
          <div className="landing-editor-canvas">
            <span className="landing-grid" />
            {preview ? <img src={preview} alt="Preview of a model made with eduCAD" /> : <div className="landing-demo-model"><span className="model-top" /><span className="model-front" /><span className="model-side" /><i /><i /></div>}
            <div className="landing-axis"><span>X</span><span>Y</span><span>Z</span></div>
          </div>
          <div className="landing-history">
            <strong>Model history</strong>
            <div className="object"><Box size={15} /> Classroom model</div>
            <div><span className="add" /> Box</div>
            <div><span className="hole" /> Hole</div>
            <div><span className="feature" /> Fillet</div>
            <section><small>Shape parameters</small><label>Width <b>60 mm</b></label><label>Height <b>24 mm</b></label></section>
          </div>
        </div>
      </div>
    </section>

    <section className="educad-landing-proof" aria-label="Product highlights">
      <div><strong>Browser-based</strong><span>Start without installing</span></div>
      <div><strong>Parametric</strong><span>Edit every operation later</span></div>
      <div><strong>Open source</strong><span>Inspect, adapt, and teach</span></div>
      <div><strong>STEP + STL</strong><span>Export dimensionally correct parts</span></div>
    </section>

    <section className="educad-landing-section" id="features">
      <div className="educad-landing-section-heading"><span>Everything stays editable</span><h2>Simple enough to begin. Powerful enough to grow.</h2><p>Direct manipulation makes the first steps intuitive, while a true operation history introduces the same mental model used by professional CAD tools.</p></div>
      <div className="educad-landing-feature-grid">{features.map(({ icon: Icon, title, copy }) => <article key={title}><i><Icon size={23} /></i><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="educad-landing-workflow" id="workflow">
      <div className="educad-landing-history-shot">
        <header><Braces size={20} /><strong>An understandable model tree</strong></header>
        <div className="tree-object"><Box size={17} /><b>Phone stand</b><small>Object</small></div>
        <div className="tree-operation add"><span>01</span><b>Rounded box</b><small>Add</small></div>
        <div className="tree-operation hole"><span>02</span><b>Extrude face</b><small>Hole</small></div>
        <div className="tree-operation feature"><span>03</span><b>Fillet</b><small>4 edges · 3 mm</small></div>
        <div className="tree-operation feature"><span>04</span><b>Linear pattern</b><small>3 instances</small></div>
      </div>
      <div className="educad-landing-workflow-copy"><span>Learn by constructing</span><h2>From a first shape to a complete feature history.</h2><ol><li><b>Place or sketch</b><p>Begin with familiar primitives or draw a constrained profile.</p></li><li><b>Build with intent</b><p>Add material, make holes, create common volumes, and refine edges.</p></li><li><b>Return to any decision</b><p>Select an earlier operation, change a parameter, and rebuild the result.</p></li></ol></div>
    </section>

    <section className="educad-landing-education" id="education">
      <div><span>Made for the classroom</span><h2>Teach the reason behind the shape.</h2><p>Students see objects as a sequence of understandable decisions—not as an opaque mesh. Units, snapping, sketches, constraints, and editable operations make design intent visible from the beginning.</p><button type="button" onClick={onStart}>Open the workspace <ArrowRight size={18} /></button></div>
      <div className="education-cards"><article><DraftingCompass size={28} /><b>Visual precision</b><small>Dimensions and constraints connect drawing with mathematics.</small></article><article><Github size={28} /><b>Open foundations</b><small>A transparent codebase schools can study and adapt.</small></article></div>
    </section>

    <footer className="educad-landing-footer"><a className="educad-landing-brand" href="#top"><img src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></a><p>Open-source parametric CAD for learning and making.</p><button type="button" onClick={onStart}>Start designing</button></footer>
  </main>;
}
