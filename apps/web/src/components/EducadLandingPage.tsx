"use client";

import { ArrowRight, BookOpen, Box, Download, GraduationCap, History, MousePointer2, PencilRuler, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  projectCount: number;
  preview?: string;
  onStart: () => void;
  onOpenChallenges: () => void;
};

const features = [
  { icon: MousePointer2, title: "Diseña de forma visual", copy: "Combina formas, mueve, gira y alinea piezas directamente en el espacio 3D." },
  { icon: PencilRuler, title: "Dibuja con medidas reales", copy: "Crea un perfil en 2D y dale volumen. Usa cotas y restricciones para definir su forma." },
  { icon: History, title: "Cambia cualquier paso", copy: "Ajusta una medida o una operación anterior: el modelo se reconstruye con tus cambios." },
  { icon: Box, title: "Da forma a tus ideas", copy: "Une piezas, haz agujeros y redondea bordes para pasar de formas sencillas a objetos útiles." },
  { icon: Download, title: "Lleva tu diseño más allá", copy: "Exporta en STL para preparar la impresión 3D o en STEP para seguir trabajando en otro CAD." },
  { icon: ShieldCheck, title: "Guarda tus proyectos", copy: "Tus diseños se guardan en este navegador. Exporta una copia para conservarlos o llevarlos a otro equipo." },
];

export function EducadLandingPage({ projectCount, preview, onStart, onOpenChallenges }: Props) {
  return <main className="educad-landing" lang="es">
    <header className="educad-landing-nav">
      <a className="educad-landing-brand" href="#top" aria-label="eduCAD, inicio"><img src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></a>
      <nav aria-label="Navegación principal"><a href="#features">Qué puedes hacer</a><a href="#challenges">Retos para el aula</a><a href="#workflow">Cómo empezar</a></nav>
      <button type="button" onClick={onStart}>{projectCount ? "Mis proyectos" : "Empezar"}<ArrowRight size={18} /></button>
    </header>

    <section className="educad-landing-hero" id="top">
      <div className="educad-landing-hero-copy">
        <span className="educad-landing-kicker"><Sparkles size={16} /> Diseño 3D para aprender creando</span>
        <h1>Imagina, diseña y aprende en 3D.</h1>
        <p>De tu primera forma a una pieza lista para imprimir. Diseña en el navegador y aprende a tu ritmo, por libre o con los retos de tu profesor.</p>
        <div className="educad-landing-actions">
          <button className="primary" type="button" onClick={onStart}>Empezar a diseñar <ArrowRight size={19} /></button>
          <a href="#challenges">Soy profe: descubrir Retos <ArrowRight size={17} /></a>
        </div>
        <small>Gratis · Sin cuenta · Sin instalar · Código abierto</small>
      </div>
      <div className="educad-landing-product-shot" role="img" aria-label="Vista ilustrativa del editor: un modelo 3D con sus medidas e historial de operaciones">
        <div className="landing-window-bar"><span /><span /><span /><strong>eduCAD — Tu idea, paso a paso</strong></div>
        <div className="landing-editor-shot">
          <aside><i /><i /><i /><i /></aside>
          <div className="landing-editor-canvas">
            <span className="landing-grid" />
            {preview ? <img src={preview} alt="Modelo creado con eduCAD" /> : <div className="landing-demo-model"><span className="model-top" /><span className="model-front" /><span className="model-side" /><i /><i /></div>}
            <div className="landing-axis"><span>X</span><span>Y</span><span>Z</span></div>
          </div>
          <div className="landing-history">
            <strong>Historial del modelo</strong>
            <div className="object"><Box size={15} /> Mi primera pieza</div>
            <div><span className="add" /> Caja</div>
            <div><span className="hole" /> Agujero</div>
            <div><span className="feature" /> Redondeo</div>
            <section><small>Medidas editables</small><label>Ancho <b>60 mm</b></label><label>Alto <b>24 mm</b></label></section>
          </div>
        </div>
      </div>
    </section>

    <section className="educad-landing-proof" aria-label="Lo esencial de eduCAD">
      <div><strong>Abre y diseña</strong><span>Directamente en tu navegador</span></div>
      <div><strong>Aprende paso a paso</strong><span>Con tutoriales y retos guiados</span></div>
      <div><strong>Edita sin empezar de cero</strong><span>Medidas e historial modificables</span></div>
      <div><strong>Del diseño a la pieza</strong><span>Exportación STL y STEP</span></div>
    </section>

    <section className="educad-landing-education" id="challenges">
      <div>
        <span><GraduationCap size={18} /> Retos · Para enseñar y aprender</span>
        <h2>Tu próxima clase empieza con un reto.</h2>
        <p>Convierte una idea en un tutorial que tus alumnos puedan seguir dentro de eduCAD. Tú propones la actividad; ellos construyen con las instrucciones junto al modelo.</p>
        <ol className="landing-challenge-steps">
          <li><b>Prepara tu actividad</b><span>Añade pasos, imágenes y medidas, y un modelo de partida si lo necesitas.</span></li>
          <li><b>Compártela con la clase</b><span>Exporta el reto como ZIP y distribúyelo por tu aula virtual o el medio que prefieras.</span></li>
          <li><b>Cada alumno, a su ritmo</b><span>Importan el reto y avanzan por las instrucciones mientras diseñan.</span></li>
        </ol>
        <button type="button" onClick={onOpenChallenges}>Abrir Retos <ArrowRight size={18} /></button>
      </div>
      <div className="landing-challenge-example">
        <div className="landing-challenge-example-heading"><BookOpen size={22} /><span>Así puede ser tu reto<small>Ejemplo de actividad para el aula</small></span></div>
        <h3>Diseña un llavero</h3>
        <p>Practica medidas, formas y agujeros creando un objeto que puedas imprimir.</p>
        <ol>
          <li><span>01</span><div><b>Crea la base</b><small>Define el ancho, el alto y el grosor.</small></div></li>
          <li><span>02</span><div><b>Haz el agujero</b><small>Deja espacio para pasar la anilla.</small></div></li>
          <li><span>03</span><div><b>Dale tu toque</b><small>Redondea los bordes y exporta tu pieza.</small></div></li>
        </ol>
        <div className="landing-challenge-example-note"><PencilRuler size={19} /><span>Tus instrucciones. Sus ideas. Un proyecto para aprender haciendo.</span></div>
      </div>
    </section>

    <section className="educad-landing-section" id="features">
      <div className="educad-landing-section-heading"><span>Herramientas sencillas, posibilidades reales</span><h2>Empieza con una forma.<br />Hazla tuya.</h2><p>No necesitas saber CAD para dar el primer paso. Descubre nuevas herramientas a medida que crecen tus ideas.</p></div>
      <div className="educad-landing-feature-grid">{features.map(({ icon: Icon, title, copy }) => <article key={title}><i><Icon size={23} /></i><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="educad-landing-workflow" id="workflow">
      <div className="educad-landing-history-shot">
        <header><History size={20} /><strong>Cada decisión queda a la vista</strong></header>
        <div className="tree-object"><Box size={17} /><b>Mi primera pieza</b><small>Objeto</small></div>
        <div className="tree-operation add"><span>01</span><b>Caja</b><small>Base</small></div>
        <div className="tree-operation hole"><span>02</span><b>Cilindro</b><small>Agujero</small></div>
        <div className="tree-operation feature"><span>03</span><b>Redondeo</b><small>3 mm</small></div>
        <p className="landing-history-note">¿La necesitas más ancha? Cambia la medida de la base y el modelo se actualiza.</p>
      </div>
      <div className="educad-landing-workflow-copy"><span>Tu primer proyecto</span><h2>De la idea al 3D, en tres pasos.</h2><ol><li><b>Elige cómo empezar</b><p>Crea un proyecto o abre un reto para seguir una actividad guiada.</p></li><li><b>Construye y experimenta</b><p>Añade formas, ajusta medidas y prueba. Siempre puedes volver a editar tus operaciones.</p></li><li><b>Guarda y comparte</b><p>Conserva una copia de tu proyecto o exporta la pieza para preparar su impresión.</p></li></ol></div>
    </section>

    <footer className="educad-landing-footer"><a className="educad-landing-brand" href="#top"><img src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></a><p>Diseño 3D abierto a tus ideas. Y a toda tu clase.</p><button type="button" onClick={onStart}>Empezar a diseñar <ArrowRight size={18} /></button></footer>
  </main>;
}
