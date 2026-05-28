import { useState, useEffect, useRef } from "react"
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, Timestamp
} from "firebase/firestore"
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth"
import { db, auth } from "./lib/firebase.js"

/* ─── helpers ────────────────────────────────────────────────────────── */
const $=(n)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0)
const today=()=>new Date().toISOString().split("T")[0]
const uid=()=>"_"+Math.random().toString(36).slice(2)
const FALLBACK="https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&q=80"

/* ─── compress image ─────────────────────────────────────────────────── */
const compress=(file)=>new Promise(ok=>{
  const r=new FileReader()
  r.onload=e=>{
    const i=new Image()
    i.onload=()=>{
      const MAX=240,c=document.createElement("canvas")
      let w=i.width,h=i.height
      if(w>h){if(w>MAX){h=h*MAX/w|0;w=MAX}}else{if(h>MAX){w=w*MAX/h|0;h=MAX}}
      c.width=w;c.height=h
      c.getContext("2d").drawImage(i,0,0,w,h)
      const b=c.toDataURL("image/jpeg",.38)
      ok(b.length<380000?b:"")
    }
    i.onerror=()=>ok("")
    i.src=e.target.result
  }
  r.onerror=()=>ok("")
  r.readAsDataURL(file)
})

/* ─── Design tokens ──────────────────────────────────────────────────── */
const T={
  bg:"#f4f2fb",
  card:"#ffffff",
  card2:"#f9f8fe",
  br:"#e8e2f5",
  v:"#5b21b6",      // deep violet
  vm:"#7c3aed",     // mid violet
  vl:"#a78bfa",     // light violet
  vbg:"#ede9fe",
  vbg2:"#f5f3ff",
  tx:"#170f2e",
  tx2:"#4c4469",
  tx3:"#9b90b8",
  ok:"#059669",     okbg:"#d1fae5",
  bl:"#2563eb",     blbg:"#dbeafe",
  am:"#d97706",     ambg:"#fef3c7",
  er:"#dc2626",     erbg:"#fee2e2",
  shadow:"0 2px 12px #5b21b618",
  shadowM:"0 8px 40px #5b21b622",
  shadowL:"0 20px 60px #5b21b628",
}

/* ─── global styles injected once ───────────────────────────────────── */
const GLOBAL_CSS=`
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .ani{animation:fadeUp .25s ease both}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:${T.vl}55;border-radius:4px}
  button:active{transform:scale(.97)}
`

function Spinner({size=20,color=T.vm}){
  return <div style={{width:size,height:size,border:`2.5px solid ${color}30`,borderTop:`2.5px solid ${color}`,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>
}

/* ─── Toast ──────────────────────────────────────────────────────────── */
let _tt
function useToast(){
  const [t,setT]=useState({m:"",on:false,err:false})
  const show=(m,err=false)=>{
    clearTimeout(_tt)
    setT({m,on:true,err})
    _tt=setTimeout(()=>setT(x=>({...x,on:false})),2400)
  }
  const el=(
    <div style={{position:"fixed",bottom:28,left:"50%",
      transform:`translateX(-50%) translateY(${t.on?0:12}px)`,
      opacity:t.on?1:0,transition:"all .22s cubic-bezier(.34,1.56,.64,1)",
      background:t.err?"linear-gradient(135deg,#dc2626,#b91c1c)":"linear-gradient(135deg,#5b21b6,#7c3aed)",
      color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:600,
      fontSize:14,padding:"11px 22px",borderRadius:50,
      pointerEvents:"none",zIndex:9999,whiteSpace:"nowrap",
      boxShadow:t.err?"0 8px 24px #dc262640":"0 8px 24px #5b21b640",
      display:"flex",alignItems:"center",gap:8}}>
      {t.err?"⚠️":"✓"} {t.m}
    </div>
  )
  return{show,el}
}

/* ════════════════════════════════════════════════════════════════════════
   AUTH SCREEN
   ════════════════════════════════════════════════════════════════════════ */
function AuthScreen({onAuth}){
  const [mode,setMode]=useState("login") // login | register
  const [name,setName]=useState("")
  const [email,setEmail]=useState("")
  const [pass,setPass]=useState("")
  const [pass2,setPass2]=useState("")
  const [showPass,setShowPass]=useState(false)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState("")

  const errMsg=(code)=>{
    const map={
      "auth/email-already-in-use":"Ese email ya está registrado.",
      "auth/invalid-email":"Email inválido.",
      "auth/weak-password":"La contraseña debe tener al menos 6 caracteres.",
      "auth/user-not-found":"No existe una cuenta con ese email.",
      "auth/wrong-password":"Contraseña incorrecta.",
      "auth/invalid-credential":"Email o contraseña incorrectos.",
      "auth/too-many-requests":"Demasiados intentos. Esperá unos minutos.",
    }
    return map[code]||"Error inesperado. Intentá de nuevo."
  }

  const submit=async()=>{
    setErr("")
    if(!email.trim()||!pass.trim())return setErr("Completá todos los campos.")
    if(mode==="register"){
      if(!name.trim())return setErr("Ingresá tu nombre.")
      if(pass!==pass2)return setErr("Las contraseñas no coinciden.")
      if(pass.length<6)return setErr("La contraseña debe tener al menos 6 caracteres.")
    }
    setLoading(true)
    try{
      if(mode==="register"){
        const cred=await createUserWithEmailAndPassword(auth,email.trim(),pass)
        await updateProfile(cred.user,{displayName:name.trim()})
        onAuth(cred.user)
      }else{
        const cred=await signInWithEmailAndPassword(auth,email.trim(),pass)
        onAuth(cred.user)
      }
    }catch(e){
      setErr(errMsg(e.code))
    }finally{setLoading(false)}
  }

  const inp=(val,set,ph,type="text",extra={})=>({
    value:val,onChange:e=>set(e.target.value),placeholder:ph,type,
    style:{
      width:"100%",background:T.card2,border:`1.5px solid ${T.br}`,
      borderRadius:10,color:T.tx,padding:"13px 16px",fontSize:15,
      outline:"none",fontFamily:"'DM Sans',sans-serif",
      boxSizing:"border-box",transition:"border-color .2s, box-shadow .2s",
      ...extra
    },
    onFocus:e=>{e.target.style.borderColor=T.vm;e.target.style.boxShadow=`0 0 0 3px ${T.vl}30`},
    onBlur:e=>{e.target.style.borderColor=T.br;e.target.style.boxShadow="none"},
  })

  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(145deg, ${T.vbg2} 0%, #fff 50%, ${T.vbg} 100%)`,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{GLOBAL_CSS}</style>

      {/* Logo */}
      <div className="ani" style={{marginBottom:28,textAlign:"center"}}>
        <img src="/logo.png" alt="MAGO Drinks" style={{height:80,objectFit:"contain",
          filter:"drop-shadow(0 8px 24px #5b21b630)"}}/>
      </div>

      {/* Card */}
      <div className="ani" style={{background:T.card,borderRadius:24,padding:32,
        width:"100%",maxWidth:400,boxShadow:T.shadowL,
        border:`1px solid ${T.br}`}}>

        {/* Tabs */}
        <div style={{display:"flex",background:T.vbg2,borderRadius:12,padding:4,marginBottom:28}}>
          {[["login","Iniciar sesión"],["register","Crear cuenta"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);setErr("")}}
              style={{flex:1,padding:"10px 0",borderRadius:9,border:"none",
              background:mode===k?T.card:"transparent",
              color:mode===k?T.v:T.tx3,
              fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,
              cursor:"pointer",transition:"all .2s",
              boxShadow:mode===k?T.shadow:"none"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {mode==="register"&&(
            <div>
              <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
                color:T.tx2,fontSize:12,fontWeight:600,marginBottom:6,letterSpacing:.5}}>
                NOMBRE
              </label>
              <input {...inp(name,setName,"Tu nombre completo")} autoFocus/>
            </div>
          )}

          <div>
            <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
              color:T.tx2,fontSize:12,fontWeight:600,marginBottom:6,letterSpacing:.5}}>
              EMAIL
            </label>
            <input {...inp(email,setEmail,"tu@email.com","email")} autoFocus={mode==="login"}/>
          </div>

          <div>
            <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
              color:T.tx2,fontSize:12,fontWeight:600,marginBottom:6,letterSpacing:.5}}>
              CONTRASEÑA
            </label>
            <div style={{position:"relative"}}>
              <input {...inp(pass,setPass,"Mínimo 6 caracteres",showPass?"text":"password",{paddingRight:46})}/>
              <button onClick={()=>setShowPass(!showPass)}
                style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                background:"none",border:"none",cursor:"pointer",color:T.tx3,fontSize:16,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                {showPass?"🙈":"👁️"}
              </button>
            </div>
          </div>

          {mode==="register"&&(
            <div>
              <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
                color:T.tx2,fontSize:12,fontWeight:600,marginBottom:6,letterSpacing:.5}}>
                REPETIR CONTRASEÑA
              </label>
              <input {...inp(pass2,setPass2,"Repetí la contraseña",showPass?"text":"password")}/>
            </div>
          )}

          {err&&(
            <div style={{background:T.erbg,border:`1px solid ${T.er}33`,borderRadius:10,
              padding:"11px 14px",color:T.er,fontSize:13,fontFamily:"'DM Sans',sans-serif",
              display:"flex",alignItems:"center",gap:8}}>
              ⚠️ {err}
            </div>
          )}

          <button onClick={submit} disabled={loading}
            style={{width:"100%",background:loading?T.vl:`linear-gradient(135deg, ${T.v}, ${T.vm})`,
            color:"#fff",border:"none",borderRadius:12,padding:"14px 0",
            fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:16,
            cursor:loading?"wait":"pointer",
            boxShadow:loading?"none":`0 6px 20px ${T.v}44`,
            transition:"all .2s",marginTop:4,
            display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            {loading&&<Spinner size={18} color="#fff"/>}
            {loading?"...":(mode==="login"?"INGRESAR":"CREAR CUENTA")}
          </button>
        </div>
      </div>

      <p style={{marginTop:20,color:T.tx3,fontSize:12,fontFamily:"'DM Sans',sans-serif",
        textAlign:"center",lineHeight:1.6}}>
        Tus productos y ventas quedan guardados<br/>en tu cuenta personal
      </p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   PRODUCT MODAL
   ════════════════════════════════════════════════════════════════════════ */
function ProductModal({p,onClose,onSave}){
  const edit=!!p?.id
  const [name,setName]=useState(p?.name||"")
  const [price,setPrice]=useState(p?.price||"")
  const [url,setUrl]=useState(p?.img||"")
  const [preview,setPreview]=useState(p?.img||"")
  const [b64,setB64]=useState(null)
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState("")
  const ref=useRef()

  const pickFile=async e=>{
    const f=e.target.files[0];if(!f)return
    setPreview(URL.createObjectURL(f));setUrl("");setB64(null);setBusy(true)
    setB64(await compress(f));setBusy(false)
  }

  const save=()=>{
    if(!name.trim())return setErr("Nombre requerido")
    const pr=parseFloat(price)
    if(!pr||pr<=0)return setErr("Precio inválido")
    if(busy)return setErr("Esperá la foto...")
    setErr("")
    onSave({id:p?.id,name:name.trim(),price:pr,img:b64||url.trim()||FALLBACK})
  }

  const I={width:"100%",background:T.card2,border:`1.5px solid ${T.br}`,borderRadius:10,
    color:T.tx,padding:"12px 14px",fontSize:15,outline:"none",
    fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box",transition:"all .2s"}

  return(
    <div style={{position:"fixed",inset:0,background:"#5b21b620",backdropFilter:"blur(6px)",
      zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div className="ani" style={{background:T.card,borderRadius:24,padding:28,
        width:"100%",maxWidth:420,boxShadow:T.shadowL,
        maxHeight:"90vh",overflowY:"auto",position:"relative",
        border:`1px solid ${T.br}`}} onClick={e=>e.stopPropagation()}>

        <button onClick={onClose} style={{position:"absolute",top:16,right:16,
          background:T.vbg,border:"none",color:T.vm,width:32,height:32,
          borderRadius:10,cursor:"pointer",fontSize:16,display:"flex",
          alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>

        <h2 style={{fontFamily:"'DM Sans',sans-serif",color:T.v,fontSize:20,
          fontWeight:800,margin:"0 0 22px"}}>
          {edit?"✏️ Editar producto":"➕ Nuevo producto"}
        </h2>

        {[["Nombre *",name,setName,"Ej: Vodka Skyy 750ml","text"],
          ["Precio *",price,setPrice,"Ej: 8500","number"]].map(([lb,vl,sv,ph,tp])=>(
          <div key={lb} style={{marginBottom:16}}>
            <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
              color:T.tx2,fontSize:12,fontWeight:600,marginBottom:6,letterSpacing:.5}}>
              {lb.toUpperCase()}
            </label>
            <input type={tp} value={vl} onChange={e=>sv(e.target.value)}
              placeholder={ph} min={tp==="number"?0:undefined} style={I}
              onFocus={e=>{e.target.style.borderColor=T.vm;e.target.style.boxShadow=`0 0 0 3px ${T.vl}30`}}
              onBlur={e=>{e.target.style.borderColor=T.br;e.target.style.boxShadow="none"}}/>
          </div>
        ))}

        <div style={{marginBottom:20}}>
          <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
            color:T.tx2,fontSize:12,fontWeight:600,marginBottom:10,letterSpacing:.5}}>
            FOTO DEL PRODUCTO
          </label>

          {preview&&(
            <div style={{position:"relative",marginBottom:12}}>
              <img src={preview} style={{width:"100%",height:140,objectFit:"cover",
                borderRadius:14,border:`1.5px solid ${T.br}`}}
                onError={e=>e.target.style.display="none"}/>
              <button onClick={()=>{setPreview("");setB64(null);setUrl("")}}
                style={{position:"absolute",top:8,right:8,background:"#ffffffee",
                border:"none",borderRadius:8,color:T.er,width:28,height:28,
                cursor:"pointer",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:14,boxShadow:T.shadow}}>✕</button>
            </div>
          )}

          <button onClick={()=>ref.current.click()}
            style={{width:"100%",padding:"12px 0",background:T.vbg,
            border:`1.5px dashed ${T.vl}`,borderRadius:12,color:T.vm,
            fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,
            cursor:"pointer",marginBottom:10,display:"flex",
            alignItems:"center",justifyContent:"center",gap:8,
            transition:"all .15s"}}>
            {busy?<><Spinner size={16}/> Procesando...</>:"📷 Subir foto desde el celular / PC"}
          </button>
          <input ref={ref} type="file" accept="image/*" onChange={pickFile} style={{display:"none"}}/>

          <div style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0 8px"}}>
            <div style={{flex:1,height:1,background:T.br}}/>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,
              color:T.tx3,fontWeight:500}}>o pegá una URL</span>
            <div style={{flex:1,height:1,background:T.br}}/>
          </div>

          <input type="text" value={url}
            onChange={e=>{setUrl(e.target.value);setB64(null);setPreview(e.target.value)}}
            placeholder="https://..." style={{...I,fontSize:13}}
            onFocus={e=>{e.target.style.borderColor=T.vm;e.target.style.boxShadow=`0 0 0 3px ${T.vl}30`}}
            onBlur={e=>{e.target.style.borderColor=T.br;e.target.style.boxShadow="none"}}/>
        </div>

        {err&&<div style={{background:T.erbg,border:`1px solid ${T.er}33`,borderRadius:10,
          padding:"10px 14px",color:T.er,fontSize:13,marginBottom:14}}>⚠️ {err}</div>}

        <button onClick={save} disabled={busy}
          style={{width:"100%",background:busy?T.vl:`linear-gradient(135deg,${T.v},${T.vm})`,
          color:"#fff",border:"none",borderRadius:12,padding:"14px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:16,
          cursor:busy?"wait":"pointer",
          boxShadow:busy?"none":`0 6px 20px ${T.v}44`,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {edit?"Guardar cambios":"Agregar producto"}
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   PAY MODAL
   ════════════════════════════════════════════════════════════════════════ */
function PayModal({total,onClose,onPay}){
  const [mode,setMode]=useState("efectivo")
  const [cash,setCash]=useState("")
  const [mp,setMp]=useState("")
  const c=parseFloat(cash)||0,m=parseFloat(mp)||0
  const change=mode==="efectivo"?Math.max(0,c-total):mode==="mixto"?Math.max(0,c-(total-m)):0
  const ok=mode==="efectivo"?c>=total:mode==="transferencia"?true:(m+c)>=total

  const mBtns=[
    {k:"efectivo",icon:"💵",l:"Efectivo"},
    {k:"transferencia",icon:"📲",l:"Transfer"},
    {k:"mixto",icon:"🔀",l:"Mixto"},
  ]

  const N={width:"100%",background:T.card2,border:`1.5px solid ${T.br}`,borderRadius:10,
    color:T.tx,padding:"13px 16px",fontSize:22,outline:"none",
    fontFamily:"'DM Mono',monospace",boxSizing:"border-box",letterSpacing:1,
    transition:"all .2s"}

  return(
    <div style={{position:"fixed",inset:0,background:"#5b21b620",backdropFilter:"blur(6px)",
      zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div className="ani" style={{background:T.card,borderRadius:24,padding:26,
        width:"100%",maxWidth:440,boxShadow:T.shadowL,position:"relative",
        border:`1px solid ${T.br}`}} onClick={e=>e.stopPropagation()}>

        <button onClick={onClose} style={{position:"absolute",top:16,right:16,
          background:T.vbg,border:"none",color:T.vm,width:32,height:32,
          borderRadius:10,cursor:"pointer",fontSize:16,display:"flex",
          alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>

        <p style={{fontFamily:"'DM Sans',sans-serif",color:T.tx3,fontSize:12,
          fontWeight:600,letterSpacing:1,marginBottom:2}}>COBRAR VENTA</p>
        <p style={{fontFamily:"'DM Mono',monospace",fontSize:36,fontWeight:700,
          color:T.tx,marginBottom:22,letterSpacing:1}}>{$(total)}</p>

        {/* mode selector */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:22}}>
          {mBtns.map(({k,icon,l})=>(
            <button key={k} onClick={()=>setMode(k)}
              style={{padding:"12px 4px",borderRadius:12,
              background:mode===k?`linear-gradient(135deg,${T.v},${T.vm})`:T.vbg2,
              color:mode===k?"#fff":T.tx2,
              border:`1.5px solid ${mode===k?T.vm:T.br}`,
              fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,
              cursor:"pointer",transition:"all .15s",
              boxShadow:mode===k?`0 4px 16px ${T.v}44`:"none"}}>
              <div style={{fontSize:18,marginBottom:3}}>{icon}</div>
              {l}
            </button>
          ))}
        </div>

        {(mode==="efectivo"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
              color:T.tx2,fontSize:12,fontWeight:600,marginBottom:8,letterSpacing:.5}}>
              {mode==="mixto"?"💵 MONTO EN EFECTIVO":"MONTO RECIBIDO"}
            </label>
            <input type="number" value={cash} onChange={e=>setCash(e.target.value)}
              placeholder="0" style={N} autoFocus
              onFocus={e=>{e.target.style.borderColor=T.ok;e.target.style.boxShadow=`0 0 0 3px ${T.ok}20`}}
              onBlur={e=>{e.target.style.borderColor=T.br;e.target.style.boxShadow="none"}}/>
          </div>
        )}

        {(mode==="transferencia"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontFamily:"'DM Sans',sans-serif",
              color:T.tx2,fontSize:12,fontWeight:600,marginBottom:8,letterSpacing:.5}}>
              📲 MONTO MP / TRANSFER
            </label>
            {mode==="transferencia"
              ?<div style={{padding:"13px 16px",background:T.blbg,
                  border:`1.5px solid ${T.bl}44`,borderRadius:10,
                  fontFamily:"'DM Mono',monospace",color:T.bl,
                  fontSize:22,letterSpacing:1}}>{$(total)}</div>
              :<input type="number" value={mp} onChange={e=>setMp(e.target.value)}
                  placeholder="0" style={N}
                  onFocus={e=>{e.target.style.borderColor=T.bl;e.target.style.boxShadow=`0 0 0 3px ${T.bl}20`}}
                  onBlur={e=>{e.target.style.borderColor=T.br;e.target.style.boxShadow="none"}}/>
            }
          </div>
        )}

        {mode==="mixto"&&m>0&&(
          <div style={{background:T.vbg,borderRadius:12,padding:"12px 16px",marginBottom:14,
            border:`1px solid ${T.vl}44`}}>
            <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,
              color:T.tx2,marginBottom:4,letterSpacing:.5}}>EFECTIVO REQUERIDO</p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:22,color:T.v,fontWeight:700}}>
              {$(Math.max(0,total-m))}
            </p>
          </div>
        )}

        {(mode==="efectivo"||mode==="mixto")&&c>0&&(
          <div style={{background:change>0?T.okbg:T.erbg,
            border:`1.5px solid ${change>0?T.ok:T.er}33`,
            borderRadius:12,padding:"12px 16px",marginBottom:18}}>
            <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,
              color:T.tx2,marginBottom:4,letterSpacing:.5}}>VUELTO</p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:32,fontWeight:700,
              color:change>0?T.ok:T.er,letterSpacing:1}}>{$(change)}</p>
            {change<0&&<p style={{fontSize:12,color:T.er,marginTop:4,
              fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
              ⚠️ Monto insuficiente
            </p>}
          </div>
        )}

        <button onClick={()=>ok&&onPay({mode,cashPaid:c,mpPaid:mode==="transferencia"?total:m,change})}
          disabled={!ok}
          style={{width:"100%",
          background:ok?`linear-gradient(135deg,${T.v},${T.vm})`:T.br,
          color:ok?"#fff":T.tx3,border:"none",borderRadius:12,padding:"15px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:17,
          cursor:ok?"pointer":"not-allowed",
          boxShadow:ok?`0 6px 20px ${T.v}44`:"none",transition:"all .2s"}}>
          Confirmar venta
        </button>
      </div>
    </div>
  )
}

/* ─── Delete Confirm ─────────────────────────────────────────────────── */
function Del({name,onYes,onNo}){
  return(
    <div style={{position:"fixed",inset:0,background:"#5b21b620",backdropFilter:"blur(6px)",
      zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="ani" style={{background:T.card,borderRadius:20,padding:28,
        maxWidth:320,width:"100%",textAlign:"center",boxShadow:T.shadowL,
        border:`1px solid ${T.br}`}}>
        <div style={{width:56,height:56,background:T.erbg,borderRadius:16,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:26,margin:"0 auto 16px"}}>🗑️</div>
        <h3 style={{fontFamily:"'DM Sans',sans-serif",color:T.tx,fontSize:17,
          fontWeight:700,marginBottom:8}}>Eliminar producto</h3>
        <p style={{color:T.tx2,fontSize:14,marginBottom:22,lineHeight:1.5}}>
          ¿Eliminar <b>"{name}"</b>?<br/>Esta acción no se puede deshacer.
        </p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onNo} style={{flex:1,padding:"12px 0",background:T.card2,
            border:`1.5px solid ${T.br}`,borderRadius:10,color:T.tx2,
            fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:15,cursor:"pointer"}}>
            Cancelar
          </button>
          <button onClick={onYes} style={{flex:1,padding:"12px 0",
            background:"linear-gradient(135deg,#dc2626,#b91c1c)",
            border:"none",borderRadius:10,color:"#fff",
            fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:15,cursor:"pointer",
            boxShadow:"0 4px 14px #dc262640"}}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════════════════ */
export default function App(){
  const {show:toast,el:toastEl}=useToast()
  const [user,setUser]=useState(undefined)
  const [tab,setTab]=useState("caja")
  const [prods,setProds]=useState([])
  const [cart,setCart]=useState([])
  const [sales,setSales]=useState([])
  const [date,setDate]=useState(today)
  const [loadP,setLoadP]=useState(false)
  const [loadS,setLoadS]=useState(false)
  const [prodModal,setProdModal]=useState(null)
  const [payModal,setPayModal]=useState(false)
  const [delModal,setDelModal]=useState(null)
  const [mobile,setMobile]=useState(window.innerWidth<768)
  const [mView,setMView]=useState("prods")

  useEffect(()=>{
    const h=()=>setMobile(window.innerWidth<768)
    window.addEventListener("resize",h)
    return()=>window.removeEventListener("resize",h)
  },[])

  useEffect(()=>{
    return onAuthStateChanged(auth,u=>setUser(u||null))
  },[])

  const prodsCol=user?collection(db,`users/${user.uid}/products`):null
  const salesCol=user?collection(db,`users/${user.uid}/sales`):null

  useEffect(()=>{
    if(!user||!prodsCol)return
    setLoadP(true)
    getDocs(prodsCol)
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0))
        setProds(list)
      })
      .catch(e=>console.warn(e))
      .finally(()=>setLoadP(false))
  },[user])

  useEffect(()=>{
    if(!user||!salesCol||tab!=="hist")return
    setLoadS(true)
    getDocs(query(salesCol,where("date","==",date)))
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0))
        setSales(list)
      })
      .catch(e=>console.warn(e))
      .finally(()=>setLoadS(false))
  },[user,tab,date])

  /* cart */
  const cartTotal=cart.reduce((s,i)=>s+i.price*i.qty,0)
  const cartQty=cart.reduce((s,i)=>s+i.qty,0)

  const addItem=p=>{
    setCart(prev=>{
      const ex=prev.find(i=>i.id===p.id)
      return ex?prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...prev,{...p,qty:1}]
    })
    toast(`${p.name} agregado`)
  }
  const setQty=(id,q)=>setCart(prev=>q<=0?prev.filter(i=>i.id!==id):prev.map(i=>i.id===id?{...i,qty:q}:i))

  /* save product optimistic */
  const saveProd=p=>{
    if(!user||!prodsCol)return
    const img=p.img||FALLBACK
    if(p.id){
      setProds(prev=>prev.map(x=>x.id===p.id?{...x,...p,img}:x))
      setProdModal(null);toast(`"${p.name}" actualizado`)
      updateDoc(doc(db,`users/${user.uid}/products`,p.id),{name:p.name,price:p.price,img}).catch(console.warn)
    }else{
      const tmp=uid()
      setProds(prev=>[...prev,{id:tmp,name:p.name,price:p.price,img,created_at:{seconds:Date.now()/1000}}])
      setProdModal(null);toast(`"${p.name}" agregado`)
      addDoc(prodsCol,{name:p.name,price:p.price,img,created_at:Timestamp.now()})
        .then(r=>setProds(prev=>prev.map(x=>x.id===tmp?{...x,id:r.id}:x)))
        .catch(console.warn)
    }
  }

  /* delete optimistic */
  const delProd=id=>{
    if(!user)return
    setProds(prev=>prev.filter(p=>p.id!==id))
    setCart(prev=>prev.filter(i=>i.id!==id))
    setDelModal(null);toast("Producto eliminado")
    if(!id.startsWith("_"))deleteDoc(doc(db,`users/${user.uid}/products`,id)).catch(console.warn)
  }

  /* confirm sale optimistic */
  const paySale=info=>{
    if(!user||!salesCol)return
    const td=today()
    const sale={
      id:uid(),date:td,total:cartTotal,
      method:info.mode,cash_paid:info.cashPaid||0,
      mp_paid:info.mpPaid||0,change_amount:info.change||0,
      items:cart.map(i=>({product_name:i.name,product_price:i.price,qty:i.qty})),
      created_at:{seconds:Date.now()/1000,toDate:()=>new Date()},
    }
    if(date===td)setSales(prev=>[sale,...prev])
    setCart([]);setPayModal(false)
    toast("✓ Venta registrada")
    if(mobile)setMView("prods")
    const{id:_,created_at:_c,...fb}=sale
    addDoc(salesCol,{...fb,created_at:Timestamp.now()})
      .then(r=>setSales(prev=>prev.map(s=>s.id===sale.id?{...s,id:r.id}:s)))
      .catch(console.warn)
  }

  /* stats */
  const st={
    total:sales.reduce((s,v)=>s+v.total,0),
    ef:sales.reduce((s,v)=>s+(v.cash_paid||0),0),
    mp:sales.reduce((s,v)=>s+(v.mp_paid||0),0),
    items:sales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0),
    count:sales.length,
  }
  const mLabel=s=>{
    if(s.method==="efectivo")return{l:"💵 Efectivo",c:T.ok,bg:T.okbg}
    if(s.method==="transferencia")return{l:"📲 Transfer",c:T.bl,bg:T.blbg}
    return{l:"🔀 Mixto",c:T.am,bg:T.ambg}
  }
  const goDay=d=>{const x=new Date(date);x.setDate(x.getDate()+d);setDate(x.toISOString().split("T")[0])}
  const isToday=date===today()

  /* loading */
  if(user===undefined){
    return(
      <div style={{minHeight:"100vh",background:T.bg,display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <style>{GLOBAL_CSS}</style>
        <img src="/logo.png" style={{height:70,objectFit:"contain",animation:"pulse 1.5s infinite"}}/>
      </div>
    )
  }

  /* not logged in */
  if(!user)return <AuthScreen onAuth={u=>setUser(u)}/>

  /* product grid */
  const ProdGrid=()=>(
    <div style={{padding:"20px 18px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:18,gap:8}}>
        <div>
          <h2 style={{fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:18,
            color:T.tx,margin:0}}>Productos</h2>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.tx3,margin:0}}>
            {prods.length} artículos
          </p>
        </div>
        <button onClick={()=>setProdModal({p:null})}
          style={{background:`linear-gradient(135deg,${T.v},${T.vm})`,color:"#fff",
          border:"none",borderRadius:12,padding:"10px 18px",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",
          boxShadow:`0 4px 16px ${T.v}44`,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:18}}>+</span> Agregar
        </button>
      </div>

      {loadP?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",padding:80,gap:14,color:T.tx3}}>
          <Spinner size={32}/>
          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500}}>
            Cargando productos...
          </span>
        </div>
      ):prods.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:T.tx3}}>
          <div style={{width:80,height:80,background:T.vbg,borderRadius:24,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:36,margin:"0 auto 16px"}}>📦</div>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:16,fontWeight:700,
            color:T.tx2,marginBottom:6}}>Sin productos aún</h3>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.tx3}}>
            Tocá "+ Agregar" para empezar
          </p>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:14}}>
          {prods.map(p=>(
            <div key={p.id}
              style={{background:T.card,border:`1.5px solid ${T.br}`,borderRadius:16,
              overflow:"hidden",position:"relative",
              boxShadow:T.shadow,transition:"transform .15s, box-shadow .15s",cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow=`0 12px 28px ${T.v}22`}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=T.shadow}}>

              {/* actions */}
              <div style={{position:"absolute",top:8,right:8,display:"flex",gap:4,zIndex:5}}>
                <button onClick={e=>{e.stopPropagation();setProdModal({p})}}
                  style={{background:"#fffffff0",backdropFilter:"blur(8px)",
                  border:`1px solid ${T.br}`,borderRadius:8,color:T.vm,
                  width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",
                  alignItems:"center",justifyContent:"center",
                  boxShadow:"0 2px 8px #00000010"}}>✏️</button>
                <button onClick={e=>{e.stopPropagation();setDelModal(p)}}
                  style={{background:"#fffffff0",backdropFilter:"blur(8px)",
                  border:`1px solid ${T.br}`,borderRadius:8,color:T.er,
                  width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",
                  alignItems:"center",justifyContent:"center",
                  boxShadow:"0 2px 8px #00000010"}}>🗑️</button>
              </div>

              <div onClick={()=>addItem(p)} style={{WebkitTapHighlightColor:"transparent"}}>
                <div style={{paddingTop:"72%",position:"relative",overflow:"hidden",background:T.vbg}}>
                  <img src={p.img} alt={p.name}
                    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",
                    transition:"transform .3s"}}
                    onError={e=>{e.target.src=FALLBACK}}
                    onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
                    onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
                </div>
                <div style={{padding:"11px 12px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.tx,lineHeight:1.3,marginBottom:4}}>
                    {p.name}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700,color:T.v}}>
                    {$(p.price)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  /* cart panel */
  const CartPanel=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:T.card}}>
      {/* header */}
      <div style={{padding:"16px 16px 12px",borderBottom:`1.5px solid ${T.br}`,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontWeight:800,fontSize:15,
            color:T.tx,margin:0,display:"flex",alignItems:"center",gap:8}}>
            Carrito
            {cartQty>0&&<span style={{background:`linear-gradient(135deg,${T.v},${T.vm})`,
              color:"#fff",borderRadius:20,padding:"2px 9px",
              fontSize:12,fontWeight:700}}>{cartQty}</span>}
          </h3>
        </div>
        {cart.length>0&&
          <button onClick={()=>setCart([])}
            style={{background:T.erbg,border:`1px solid ${T.er}22`,borderRadius:8,
            color:T.er,padding:"5px 12px",cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600}}>
            Vaciar
          </button>
        }
      </div>

      {/* items */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
        {cart.length===0?(
          <div style={{textAlign:"center",padding:"50px 20px",color:T.tx3}}>
            <div style={{width:64,height:64,background:T.vbg,borderRadius:20,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:28,margin:"0 auto 12px"}}>🛒</div>
            <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
              fontWeight:500,lineHeight:1.6}}>
              Tocá un producto<br/>para agregar
            </p>
          </div>
        ):cart.map(it=>(
          <div key={it.id} style={{display:"flex",alignItems:"center",
            padding:"10px 14px",borderBottom:`1px solid ${T.br}`,gap:10}}>
            <img src={it.img} alt={it.name}
              style={{width:42,height:42,borderRadius:10,objectFit:"cover",
              flexShrink:0,border:`1px solid ${T.br}`}}
              onError={e=>{e.target.src=FALLBACK}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.tx,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {it.name}
              </div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                color:T.v,fontWeight:700}}>{$(it.price*it.qty)}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <button onClick={()=>setQty(it.id,it.qty-1)}
                style={{width:30,height:30,background:T.card2,border:`1.5px solid ${T.br}`,
                borderRadius:8,color:T.tx2,fontSize:18,cursor:"pointer",display:"flex",
                alignItems:"center",justifyContent:"center",lineHeight:1,fontWeight:700}}>−</button>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:T.tx,
                minWidth:22,textAlign:"center",fontWeight:700}}>{it.qty}</span>
              <button onClick={()=>setQty(it.id,it.qty+1)}
                style={{width:30,height:30,background:T.vbg,border:`1.5px solid ${T.vl}`,
                borderRadius:8,color:T.vm,fontSize:18,cursor:"pointer",display:"flex",
                alignItems:"center",justifyContent:"center",lineHeight:1,fontWeight:700}}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{borderTop:`1.5px solid ${T.br}`,padding:"16px 16px 18px",background:T.card2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
          <span style={{fontFamily:"'DM Sans',sans-serif",color:T.tx2,fontSize:14,fontWeight:600}}>
            Total
          </span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:700,
            color:T.tx,letterSpacing:1}}>{$(cartTotal)}</span>
        </div>
        <button onClick={()=>cart.length?setPayModal(true):toast("El carrito está vacío")}
          style={{width:"100%",
          background:cart.length?`linear-gradient(135deg,${T.v},${T.vm})`:"#e0dce8",
          color:cart.length?"#fff":"#aaa",border:"none",borderRadius:12,padding:"15px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:18,
          cursor:cart.length?"pointer":"not-allowed",
          boxShadow:cart.length?`0 6px 20px ${T.v}44`:"none",transition:"all .2s"}}>
          Cobrar
        </button>
      </div>
    </div>
  )

  return(
    <>
      <style>{GLOBAL_CSS}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>

      <div style={{minHeight:"100vh",background:T.bg,color:T.tx,fontFamily:"'DM Sans',sans-serif"}}>

        {/* ── HEADER ── */}
        <header style={{background:"#ffffffee",backdropFilter:"blur(12px)",
          borderBottom:`1px solid ${T.br}`,padding:"0 20px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          height:64,position:"sticky",top:0,zIndex:100,
          boxShadow:"0 1px 20px #5b21b610",gap:12}}>

          <img src="/logo.png" alt="MAGO" style={{height:44,objectFit:"contain"}}/>

          <nav style={{display:"flex",alignItems:"center",gap:6}}>
            {[["caja","🏪","CAJA"],["hist","📊","HISTORIAL"]].map(([k,ic,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{background:tab===k?`linear-gradient(135deg,${T.v},${T.vm})`:T.vbg2,
                color:tab===k?"#fff":T.tx2,
                border:`1.5px solid ${tab===k?T.vm:T.br}`,borderRadius:10,
                padding:"8px 14px",fontFamily:"'DM Sans',sans-serif",fontWeight:700,
                fontSize:13,cursor:"pointer",transition:"all .15s",
                boxShadow:tab===k?`0 4px 14px ${T.v}44`:"none",
                display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:14}}>{ic}</span> {l}
              </button>
            ))}

            {/* user */}
            <div style={{display:"flex",alignItems:"center",gap:8,
              marginLeft:8,paddingLeft:12,borderLeft:`1px solid ${T.br}`}}>
              <div style={{width:32,height:32,background:`linear-gradient(135deg,${T.v},${T.vm})`,
                borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",
                color:"#fff",fontWeight:700,fontSize:14,flexShrink:0}}>
                {(user.displayName||user.email||"?")[0].toUpperCase()}
              </div>
              {!mobile&&<span style={{fontSize:13,color:T.tx2,fontWeight:500,maxWidth:120,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {user.displayName||user.email}
              </span>}
              <button onClick={async()=>{
                await signOut(auth);setProds([]);setCart([]);setSales([]);toast("Sesión cerrada")
              }} style={{background:T.erbg,border:`1px solid ${T.er}22`,borderRadius:8,
                color:T.er,padding:"6px 10px",cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,
                whiteSpace:"nowrap"}}>
                Salir
              </button>
            </div>
          </nav>
        </header>

        {/* ── CAJA ── */}
        {tab==="caja"&&(mobile?(
          <div style={{height:"calc(100vh - 64px)",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",background:T.card,borderBottom:`1px solid ${T.br}`}}>
              {[["prods","🏪 Productos"],["cart",`🛒 Carrito (${cartQty})`]].map(([v,l])=>(
                <button key={v} onClick={()=>setMView(v)}
                  style={{flex:1,padding:"13px 0",background:"transparent",
                  color:mView===v?T.vm:T.tx3,border:"none",
                  borderBottom:`3px solid ${mView===v?T.vm:"transparent"}`,
                  fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",
                  transition:"all .15s"}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{flex:1,overflow:"auto"}}>
              {mView==="prods"?<ProdGrid/>:<CartPanel/>}
            </div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 320px",
            height:"calc(100vh - 64px)",overflow:"hidden"}}>
            <div style={{overflowY:"auto",background:T.bg}}><ProdGrid/></div>
            <div style={{borderLeft:`1px solid ${T.br}`,overflow:"hidden"}}><CartPanel/></div>
          </div>
        ))}

        {/* ── HISTORIAL ── */}
        {tab==="hist"&&(
          <div style={{maxWidth:880,margin:"0 auto",padding:"24px 18px"}}>

            {/* nav fecha */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:22,flexWrap:"wrap",gap:12}}>
              <div>
                <h2 style={{fontFamily:"'DM Sans',sans-serif",fontWeight:800,
                  fontSize:24,color:T.tx,margin:0}}>Historial de ventas</h2>
                <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                  color:T.tx3,margin:0}}>{st.count} ventas registradas</p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:T.card,
                border:`1.5px solid ${T.br}`,borderRadius:14,padding:"6px 8px",
                boxShadow:T.shadow}}>
                <button onClick={()=>goDay(-1)}
                  style={{background:T.vbg,border:"none",borderRadius:9,color:T.vm,
                  width:32,height:32,cursor:"pointer",fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  style={{background:"transparent",border:"none",color:T.tx,
                  fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:500,
                  outline:"none",cursor:"pointer",minWidth:128,textAlign:"center"}}/>
                <button onClick={()=>goDay(1)} disabled={isToday}
                  style={{background:isToday?T.card2:T.vbg,border:"none",borderRadius:9,
                  color:isToday?T.tx3:T.vm,width:32,height:32,
                  cursor:isToday?"not-allowed":"pointer",fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
                {!isToday&&
                  <button onClick={()=>setDate(today())}
                    style={{background:`linear-gradient(135deg,${T.v},${T.vm})`,
                    border:"none",borderRadius:9,color:"#fff",
                    padding:"0 12px",height:32,cursor:"pointer",
                    fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}>
                    Hoy
                  </button>
                }
              </div>
            </div>

            {/* stat cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",
              gap:12,marginBottom:24}}>
              {[
                {l:"Total",         v:$(st.total), c:T.v,  bg:T.vbg,  icon:"💰"},
                {l:"Efectivo",      v:$(st.ef),    c:T.ok, bg:T.okbg, icon:"💵"},
                {l:"Transfer / MP", v:$(st.mp),    c:T.bl, bg:T.blbg, icon:"📲"},
                {l:"Artículos",     v:st.items,    c:T.am, bg:T.ambg, icon:"📦"},
                {l:"Ventas",        v:st.count,    c:T.v,  bg:T.vbg,  icon:"🧾"},
              ].map(({l,v,c,bg,icon})=>(
                <div key={l} style={{background:bg,border:`1.5px solid ${c}22`,
                  borderRadius:14,padding:"14px 16px",boxShadow:T.shadow}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <span style={{fontSize:16}}>{icon}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,
                      fontWeight:600,color:T.tx2,letterSpacing:.5}}>{l.toUpperCase()}</span>
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                    fontSize:20,color:c,letterSpacing:.5}}>{v}</div>
                </div>
              ))}
            </div>

            {/* list */}
            {loadS?(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                padding:60,gap:14,color:T.tx3}}>
                <Spinner size={28}/><span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14}}>Cargando...</span>
              </div>
            ):sales.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:T.tx3}}>
                <div style={{width:72,height:72,background:T.vbg,borderRadius:22,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:32,margin:"0 auto 16px"}}>📋</div>
                <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:16,fontWeight:700,
                  color:T.tx2,marginBottom:6}}>Sin ventas este día</h3>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sales.map((s,i)=>{
                  const m=mLabel(s)
                  const ts=(s.created_at?.toDate?s.created_at.toDate():new Date(s.created_at.seconds*1000))
                    .toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
                  return(
                    <div key={s.id} className="ani"
                      style={{background:T.card,border:`1.5px solid ${T.br}`,
                      borderRadius:14,padding:"14px 18px",boxShadow:T.shadow}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,
                            color:T.tx3,background:T.card2,padding:"2px 8px",
                            borderRadius:6,fontWeight:600}}>
                            #{sales.length-i}
                          </span>
                          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,
                            color:T.tx3,fontWeight:500}}>{ts}</span>
                          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,
                            fontWeight:700,padding:"3px 10px",borderRadius:20,
                            background:m.bg,color:m.c}}>{m.l}</span>
                        </div>
                        <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                          fontSize:18,color:T.tx,letterSpacing:.5}}>{$(s.total)}</span>
                      </div>
                      <p style={{fontSize:13,color:T.tx2,
                        marginBottom:(s.change_amount>0||s.method==="mixto")?6:0,lineHeight:1.5}}>
                        {(s.items||[]).map(it=>`${it.product_name} ×${it.qty}`).join("  ·  ")}
                      </p>
                      {(s.method==="mixto"||s.change_amount>0)&&(
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                          {s.method==="mixto"&&<>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:T.ok,background:T.okbg,padding:"3px 10px",
                              borderRadius:20,fontWeight:600}}>
                              💵 {$(s.cash_paid)}
                            </span>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:T.bl,background:T.blbg,padding:"3px 10px",
                              borderRadius:20,fontWeight:600}}>
                              📲 {$(s.mp_paid)}
                            </span>
                          </>}
                          {s.change_amount>0&&
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:T.am,background:T.ambg,padding:"3px 10px",
                              borderRadius:20,fontWeight:600}}>
                              ↩ Vuelto {$(s.change_amount)}
                            </span>
                          }
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {prodModal&&<ProductModal p={prodModal.p} onClose={()=>setProdModal(null)} onSave={saveProd}/>}
      {payModal&&<PayModal total={cartTotal} onClose={()=>setPayModal(false)} onPay={paySale}/>}
      {delModal&&<Del name={delModal.name} onYes={()=>delProd(delModal.id)} onNo={()=>setDelModal(null)}/>}
      {toastEl}
    </>
  )
}
