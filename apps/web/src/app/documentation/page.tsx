"use client";

import { useEffect, useState } from "react";

export default function DocumentationPage() {
  const [spanish, setSpanish] = useState(false);
  useEffect(() => { setSpanish(new URLSearchParams(window.location.search).get("lang") === "es"); }, []);
  return <main className="educad-documentation-page">
    <header><a href="/">eduCAD</a><strong>{spanish ? "Documentación" : "Documentation"}</strong></header>
    <article>
      <h1>{spanish ? "Aprende a diseñar con eduCAD" : "Learn to design with eduCAD"}</h1>
      <p>{spanish ? "Aquí encontrarás la guía de uso, tutoriales y recursos para aprender CAD paramétrico. Esta página está en preparación." : "Find user guides, tutorials and resources for learning parametric CAD here. This page is under construction."}</p>
      <nav><a href="#getting-started">{spanish ? "Primeros pasos" : "Getting started"}</a><a href="#sketches">{spanish ? "Bocetos" : "Sketches"}</a><a href="#tutorials">{spanish ? "Tutoriales" : "Tutorials"}</a></nav>
      <section id="getting-started"><h2>{spanish ? "Primeros pasos" : "Getting started"}</h2><p>{spanish ? "Crea un proyecto vacío, añade formas y modifica sus parámetros. Usa el árbol de operaciones para volver a editar cada paso." : "Create an empty project, add shapes and adjust their parameters. Use the operation tree to revisit and edit each step."}</p></section>
      <section id="sketches"><h2>{spanish ? "Bocetos y restricciones" : "Sketches and constraints"}</h2><p>{spanish ? "Dibuja líneas y curvas, añade cotas y restricciones y guarda el boceto para usarlo en operaciones 3D." : "Draw lines and curves, add dimensions and constraints, and save the sketch to use it in 3D operations."}</p></section>
      <section id="tutorials"><h2>{spanish ? "Tutoriales" : "Tutorials"}</h2><p>{spanish ? "Próximamente: ejercicios guiados, ejemplos y recursos para docentes." : "Coming soon: guided exercises, examples and teaching resources."}</p></section>
    </article>
  </main>;
}
