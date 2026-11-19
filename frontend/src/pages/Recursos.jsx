import { useMemo, useState } from 'react';
import ModuleBanner from '../components/ModuleBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const seed = [
 { id: 1, title: 'Introducción a bases de datos', type: 'PDF', carrera: 'Desarrollo de Software Multiplataforma', subject: 'Bases de datos', topic: 'Modelo entidad-relación', owner: 'Ana Demo Estudiante', reviewed: true, date: '2026-11-10' },
 { id: 2, title: 'Guía de consultas SQL', type: 'PDF', carrera: 'Desarrollo de Software Multiplataforma', subject: 'Bases de datos', topic: 'Consultas SQL', owner: 'Luis Demo Docente', reviewed: false, date: '2026-11-12' },
 { id: 3, title: 'Componentes de React', type: 'PRESENTACIÓN', carrera: 'Desarrollo de Software Multiplataforma', subject: 'Aplicaciones web', topic: 'React', owner: 'Ana Demo Estudiante', reviewed: false, date: '2026-11-15' },
];
const module = { id: 3, name: 'Repositorio de recursos y validación docente', desc: 'Comparte, busca y confía en materiales revisados', c1: '#4d7c0f', c2: '#6aa51a' };
const typeOf = file => file.type.includes('pdf') ? 'PDF' : file.type.startsWith('image/') ? 'IMAGEN' : file.name.match(/\.(ppt|pptx)$/i) ? 'PRESENTACIÓN' : file.type.includes('word') || /\.(doc|docx)$/i.test(file.name) ? 'DOCUMENTO' : 'ARCHIVO';

export default function Recursos() {
 const { user } = useAuth();
 const [items,setItems] = useState(()=>{try{return JSON.parse(localStorage.getItem('kolab.recursos'))||seed}catch{return seed}});
 const [query,setQuery] = useState(''); const [career,setCareer] = useState('Todas'); const [subject,setSubject] = useState('Todas'); const [topic,setTopic] = useState('Todas'); const [status,setStatus] = useState('Todos'); const [message,setMessage] = useState('');
 const [title,setTitle] = useState(''); const [file,setFile] = useState(null); const [formCareer,setFormCareer] = useState('Desarrollo de Software Multiplataforma'); const [formSubject,setFormSubject] = useState(''); const [formTopic,setFormTopic] = useState('');
 const isTeacher = ['docente','admin'].includes(user?.rol);
 const filtered = useMemo(()=>items.filter(x=>(!query || `${x.title} ${x.subject} ${x.topic}`.toLowerCase().includes(query.toLowerCase()))&&(career==='Todas'||x.carrera===career)&&(subject==='Todas'||x.subject===subject)&&(topic==='Todas'||x.topic===topic)&&(status==='Todos'||(status==='Revisados'?x.reviewed:!x.reviewed))),[items,query,career,subject,topic,status]);
 function persist(next){setItems(next);localStorage.setItem('kolab.recursos',JSON.stringify(next))}
 function upload(e){e.preventDefault(); if(!file)return; const next=[{id:Date.now(),title:title.trim()||file.name,type:typeOf(file),carrera:formCareer,subject:formSubject||'Sin asignatura',topic:formTopic||'Sin tema',owner:`${user.nombre} ${user.apellidos}`,reviewed:false,date:new Date().toISOString().slice(0,10),fileName:file.name},...items];persist(next);setTitle('');setFile(null);e.target.reset();setMessage('Recurso agregado al repositorio. Está pendiente de revisión docente.');}
 function review(id){persist(items.map(x=>x.id===id?{...x,reviewed:true}:x))}
 return <>
  <ModuleBanner module={module}><span className="chip chip--soft">Módulo 3</span></ModuleBanner>
  <div className="kolab-module">
   <section className="km-toolbar"><div><h2>Repositorio de recursos</h2><p className="muted">Materiales compartidos por la comunidad académica.</p></div><span className="chip chip--soft">{items.length} recursos</span></section>
   <section className="card km-upload">
    <div><h2>Compartir un recurso</h2><p className="muted">Sube apuntes y materiales para que otros estudiantes puedan consultarlos.</p></div>
    <form onSubmit={upload}>
     <div className="form-grid">
      <div className="field"><label>Nombre del recurso</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Apuntes de unidad 1"/></div>
      <div className="field"><label>Archivo (PDF, imagen, presentación o documento)</label><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.ppt,.pptx,.doc,.docx" onChange={e=>setFile(e.target.files?.[0]||null)} required/></div>
      <div className="field"><label>Carrera</label><input value={formCareer} onChange={e=>setFormCareer(e.target.value)}/></div>
      <div className="field"><label>Asignatura</label><input value={formSubject} onChange={e=>setFormSubject(e.target.value)} placeholder="Ej. Bases de datos" required/></div>
      <div className="field"><label>Tema</label><input value={formTopic} onChange={e=>setFormTopic(e.target.value)} placeholder="Ej. Consultas SQL"/></div>
     </div>
     <div className="km-actions"><button className="btn btn--primary" disabled={!file}>＋ Publicar recurso</button>{file&&<span className="muted">{file.name}</span>}</div>
     {message&&<p className="form-ok" role="status">{message}</p>}
    </form>
   </section>
   <section className="km-filter-panel">
    <div className="field"><label>Buscar</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por recurso, asignatura o tema…"/></div>
    <div className="form-grid">
     <div className="field"><label>Carrera</label><select value={career} onChange={e=>setCareer(e.target.value)}><option>Todas</option>{[...new Set(items.map(x=>x.carrera))].map(x=><option key={x}>{x}</option>)}</select></div>
     <div className="field"><label>Asignatura</label><select value={subject} onChange={e=>setSubject(e.target.value)}><option>Todas</option>{[...new Set(items.map(x=>x.subject))].map(x=><option key={x}>{x}</option>)}</select></div>
     <div className="field"><label>Tema</label><select value={topic} onChange={e=>setTopic(e.target.value)}><option>Todas</option>{[...new Set(items.map(x=>x.topic))].map(x=><option key={x}>{x}</option>)}</select></div>
     <div className="field"><label>Validación</label><select value={status} onChange={e=>setStatus(e.target.value)}><option>Todos</option><option>Revisados</option><option>Sin revisar</option></select></div>
    </div>
   </section>
   <section className="km-resource-grid">
    {filtered.map(x=><article className="card km-resource" key={x.id}>
      <div className="km-resource-top"><span className="km-file-icon">{x.type==='PDF'?'PDF':x.type==='IMAGEN'?'IMG':x.type==='PRESENTACIÓN'?'PPT':'DOC'}</span><span className={`chip ${x.reviewed?'chip--soft':'chip--xp'}`}>{x.reviewed?'✓ Revisado por docente':'Sin revisar'}</span></div>
      <h3>{x.title}</h3><p className="muted">{x.subject} · {x.topic}</p><small className="muted">{x.carrera}</small><small className="muted">Compartido por {x.owner}</small>
      <div className="km-resource-bottom"><span className="muted">{x.date}</span>{isTeacher&&!x.reviewed&&<button className="btn btn--primary btn--sm" onClick={()=>review(x.id)}>Validar recurso</button>}</div>
    </article>)}
    {!filtered.length&&<div className="card"><p className="muted">No se encontraron recursos con esos filtros.</p></div>}
   </section>
   <p className="km-note">Prototipo local: los registros se guardan en este navegador. La validación docente es demostrativa; la carga real de archivos, almacenamiento e indexación se conectarán al backend.</p>
  </div>
 </>;
}
