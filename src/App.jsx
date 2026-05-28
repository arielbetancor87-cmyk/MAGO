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

/* ─── helpers ─────────────────────────────────────────────────────── */
const $=(n)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0)
const today=()=>new Date().toISOString().split("T")[0]
const uid=()=>"_"+Math.random().toString(36).slice(2)
const FALLBACK="https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&q=80"

/* ─── compress ────────────────────────────────────────────────────── */
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

/* ─── tokens ──────────────────────────────────────────────────────── */
const C={
  bg:"#f4f2fb", card:"#ffffff", card2:"#f7f5fd",
  br:"#e4dff5",
  v:"#5b21b6", vm:"#7c3aed", vl:"#a78bfa", vbg:"#ede9fe",
  tx:"#170f2e", tx2:"#4c4469", tx3:"#9b90b8",
  ok:"#059669", okbg:"#d1fae5",
  bl:"#2563eb", blbg:"#dbeafe",
  am:"#d97706", ambg:"#fef3c7",
  er:"#dc2626", erbg:"#fee2e2",
  sh:"0 2px 12px rgba(91,33,182,.10)",
  shM:"0 8px 32px rgba(91,33,182,.16)",
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.tx};-webkit-font-smoothing:antialiased}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
input[type=number]{-moz-appearance:textfield}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.vl}55;border-radius:4px}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
.fadeUp{animation:fadeUp .22s ease both}
button{cursor:pointer;-webkit-appearance:none;appearance:none}
button:active{opacity:.85;transform:scale(.97)}
`

/* ─── Spinner ─────────────────────────────────────────────────────── */
const Spin=({s=20,c=C.vm})=>(
  <div style={{width:s,height:s,flexShrink:0,border:`2.5px solid ${c}22`,
    borderTop:`2.5px solid ${c}`,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
)

/* ─── Toast ───────────────────────────────────────────────────────── */
let _tt
function useToast(){
  const [t,setT]=useState({m:"",on:false,err:false})
  const show=(m,err=false)=>{
    clearTimeout(_tt);setT({m,on:true,err})
    _tt=setTimeout(()=>setT(x=>({...x,on:false})),2300)
  }
  const el=(
    <div style={{position:"fixed",bottom:24,left:"50%",zIndex:9999,
      transform:`translateX(-50%) translateY(${t.on?0:10}px)`,
      opacity:t.on?1:0,transition:"opacity .2s, transform .2s",
      background:t.err?C.er:C.v,color:"#fff",
      fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,
      padding:"11px 20px",borderRadius:50,pointerEvents:"none",
      whiteSpace:"nowrap",boxShadow:`0 6px 20px ${t.err?C.er:C.v}55`,
      display:"flex",alignItems:"center",gap:7}}>
      {t.err?"⚠️":"✓"} {t.m}
    </div>
  )
  return{show,el}
}

/* ════════════════════════════════════════════════════════════
   LOGIN / REGISTER
════════════════════════════════════════════════════════════ */
function AuthScreen(){
  const [mode,setMode]=useState("login")
  const [name,setName]=useState("")
  const [email,setEmail]=useState("")
  const [pass,setPass]=useState("")
  const [pass2,setPass2]=useState("")
  const [showP,setShowP]=useState(false)
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState("")

  const errMsg=code=>({
    "auth/email-already-in-use":"Ese email ya está registrado.",
    "auth/invalid-email":"Email inválido.",
    "auth/weak-password":"Mínimo 6 caracteres.",
    "auth/user-not-found":"No existe esa cuenta.",
    "auth/wrong-password":"Contraseña incorrecta.",
    "auth/invalid-credential":"Email o contraseña incorrectos.",
    "auth/too-many-requests":"Demasiados intentos. Esperá un momento.",
  })[code]||"Error. Intentá de nuevo."

  const submit=async()=>{
    setErr("")
    if(!email.trim()||!pass)return setErr("Completá todos los campos.")
    if(mode==="register"){
      if(!name.trim())return setErr("Ingresá tu nombre.")
      if(pass!==pass2)return setErr("Las contraseñas no coinciden.")
      if(pass.length<6)return setErr("Mínimo 6 caracteres.")
    }
    setBusy(true)
    try{
      if(mode==="register"){
        const cr=await createUserWithEmailAndPassword(auth,email.trim(),pass)
        await updateProfile(cr.user,{displayName:name.trim()})
      }else{
        await signInWithEmailAndPassword(auth,email.trim(),pass)
      }
    }catch(e){setErr(errMsg(e.code))}
    finally{setBusy(false)}
  }

  const onKey=e=>{ if(e.key==="Enter") submit() }

  const inp=(val,set,ph,type="text")=>(
    <input type={type} value={val} placeholder={ph}
      onChange={e=>set(e.target.value)} onKeyDown={onKey}
      style={{width:"100%",background:C.card2,border:`1.5px solid ${C.br}`,
      borderRadius:10,color:C.tx,padding:"13px 15px",fontSize:16,
      outline:"none",fontFamily:"'DM Sans',sans-serif",display:"block"}}
      onFocus={e=>{e.target.style.borderColor=C.vm;e.target.style.boxShadow=`0 0 0 3px ${C.vl}28`}}
      onBlur={e=>{e.target.style.borderColor=C.br;e.target.style.boxShadow="none"}}/>
  )

  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${C.vbg} 0%,#fff 55%,${C.bg} 100%)`,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",padding:"20px 16px"}}>

      <img src="/logo.png" alt="MAGO Drinks"
        style={{height:76,objectFit:"contain",marginBottom:28,
        filter:"drop-shadow(0 6px 18px rgba(91,33,182,.22))"}}/>

      <div className="fadeUp" style={{background:C.card,borderRadius:22,padding:"28px 24px",
        width:"100%",maxWidth:390,boxShadow:C.shM,border:`1px solid ${C.br}`}}>

        {/* tabs */}
        <div style={{display:"flex",background:C.card2,borderRadius:12,padding:4,marginBottom:24}}>
          {[["login","Iniciar sesión"],["register","Crear cuenta"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);setErr("")}}
              style={{flex:1,padding:"10px 0",borderRadius:9,border:"none",
              background:mode===k?C.card:"transparent",
              color:mode===k?C.v:C.tx3,
              fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,
              boxShadow:mode===k?C.sh:"none",transition:"all .18s"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {mode==="register"&&(
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,
                color:C.tx2,letterSpacing:.6,marginBottom:6}}>NOMBRE</label>
              {inp(name,setName,"Tu nombre")}
            </div>
          )}

          <div>
            <label style={{display:"block",fontSize:11,fontWeight:700,
              color:C.tx2,letterSpacing:.6,marginBottom:6}}>EMAIL</label>
            {inp(email,setEmail,"tucuenta@email.com","email")}
          </div>

          <div>
            <label style={{display:"block",fontSize:11,fontWeight:700,
              color:C.tx2,letterSpacing:.6,marginBottom:6}}>CONTRASEÑA</label>
            <div style={{position:"relative"}}>
              {inp(pass,setPass,"Mínimo 6 caracteres",showP?"text":"password")}
              <button onClick={()=>setShowP(!showP)}
                style={{position:"absolute",right:12,top:"50%",
                transform:"translateY(-50%)",background:"none",border:"none",
                color:C.tx3,fontSize:18,display:"flex",alignItems:"center",padding:4}}>
                {showP?"🙈":"👁️"}
              </button>
            </div>
          </div>

          {mode==="register"&&(
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,
                color:C.tx2,letterSpacing:.6,marginBottom:6}}>REPETIR CONTRASEÑA</label>
              {inp(pass2,setPass2,"Repetí la contraseña",showP?"text":"password")}
            </div>
          )}

          {err&&(
            <div style={{background:C.erbg,border:`1px solid ${C.er}33`,borderRadius:10,
              padding:"11px 14px",color:C.er,fontSize:14,display:"flex",
              alignItems:"flex-start",gap:8}}>
              ⚠️ {err}
            </div>
          )}

          <button onClick={submit} disabled={busy}
            style={{width:"100%",background:busy?C.vl:`linear-gradient(135deg,${C.v},${C.vm})`,
            color:"#fff",border:"none",borderRadius:12,padding:"15px 0",
            fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:16,
            boxShadow:busy?"none":`0 5px 18px ${C.v}44`,
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            marginTop:4}}>
            {busy&&<Spin s={18} c="#fff"/>}
            {busy?"...":(mode==="login"?"Ingresar":"Crear cuenta")}
          </button>
        </div>
      </div>

      <p style={{marginTop:18,color:C.tx3,fontSize:12,textAlign:"center",lineHeight:1.6}}>
        Tus productos y ventas quedan guardados<br/>en tu cuenta personal
      </p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PRODUCT MODAL
════════════════════════════════════════════════════════════ */
function ProductModal({p,onClose,onSave}){
  const edit=!!p?.id
  const [name,setName]=useState(p?.name||"")
  const [price,setPrice]=useState(p?.price||"")
  const [url,setUrl]=useState(p?.img||"")
  const [preview,setPreview]=useState(p?.img||"")
  const [b64,setB64]=useState(null)
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState("")
  const fRef=useRef()

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
    onSave({id:p?.id,name:name.trim(),price:pr,img:b64||url.trim()||FALLBACK})
  }

  const I={width:"100%",background:C.card2,border:`1.5px solid ${C.br}`,borderRadius:10,
    color:C.tx,padding:"12px 14px",fontSize:16,outline:"none",
    fontFamily:"'DM Sans',sans-serif",display:"block"}

  return(
    <div style={{position:"fixed",inset:0,zIndex:800,background:"rgba(91,33,182,.18)",
      display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onClose}>
      <div className="fadeUp" style={{background:C.card,borderRadius:"22px 22px 0 0",
        padding:"24px 20px 32px",width:"100%",maxWidth:500,
        maxHeight:"92vh",overflowY:"auto",position:"relative",
        boxShadow:"0 -8px 40px rgba(91,33,182,.18)"}}
        onClick={e=>e.stopPropagation()}>

        {/* drag handle */}
        <div style={{width:40,height:4,background:C.br,borderRadius:4,
          margin:"-8px auto 18px"}}/>

        <button onClick={onClose} style={{position:"absolute",top:18,right:18,
          background:C.vbg,border:"none",color:C.vm,width:32,height:32,
          borderRadius:10,fontSize:16,display:"flex",
          alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>

        <h2 style={{fontSize:19,fontWeight:800,color:C.tx,marginBottom:20}}>
          {edit?"✏️ Editar producto":"➕ Nuevo producto"}
        </h2>

        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.tx2,
            letterSpacing:.6,marginBottom:6}}>NOMBRE *</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)}
            placeholder="Ej: Vodka Skyy 750ml" style={I}
            onFocus={e=>{e.target.style.borderColor=C.vm}}
            onBlur={e=>{e.target.style.borderColor=C.br}}/>
        </div>

        <div style={{marginBottom:18}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.tx2,
            letterSpacing:.6,marginBottom:6}}>PRECIO *</label>
          <input type="number" value={price} onChange={e=>setPrice(e.target.value)}
            placeholder="Ej: 8500" min={0} style={I}
            onFocus={e=>{e.target.style.borderColor=C.vm}}
            onBlur={e=>{e.target.style.borderColor=C.br}}/>
        </div>

        <div style={{marginBottom:20}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.tx2,
            letterSpacing:.6,marginBottom:10}}>FOTO</label>

          {preview&&(
            <div style={{position:"relative",marginBottom:12}}>
              <img src={preview} style={{width:"100%",height:130,objectFit:"cover",
                borderRadius:12,border:`1.5px solid ${C.br}`,display:"block"}}
                onError={e=>e.target.style.display="none"}/>
              <button onClick={()=>{setPreview("");setB64(null);setUrl("")}}
                style={{position:"absolute",top:8,right:8,background:"rgba(255,255,255,.95)",
                border:"none",borderRadius:8,color:C.er,width:28,height:28,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✕</button>
            </div>
          )}

          <button onClick={()=>fRef.current.click()}
            style={{width:"100%",padding:"12px",background:C.vbg,
            border:`1.5px dashed ${C.vl}`,borderRadius:12,color:C.vm,
            fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",
            gap:8,marginBottom:10}}>
            {busy?<><Spin s={16}/> Procesando...</>:"📷 Subir foto"}
          </button>
          <input ref={fRef} type="file" accept="image/*"
            onChange={pickFile} style={{display:"none"}}/>

          <input type="text" value={url}
            onChange={e=>{setUrl(e.target.value);setB64(null);setPreview(e.target.value)}}
            placeholder="o pegá una URL..." style={{...I,fontSize:13}}
            onFocus={e=>{e.target.style.borderColor=C.vm}}
            onBlur={e=>{e.target.style.borderColor=C.br}}/>
        </div>

        {err&&<div style={{background:C.erbg,borderRadius:10,padding:"10px 14px",
          color:C.er,fontSize:13,marginBottom:14}}>⚠️ {err}</div>}

        <button onClick={save} disabled={busy}
          style={{width:"100%",background:busy?C.vl:`linear-gradient(135deg,${C.v},${C.vm})`,
          color:"#fff",border:"none",borderRadius:12,padding:"15px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:16,
          boxShadow:busy?"none":`0 5px 18px ${C.v}44`,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {edit?"Guardar cambios":"Agregar producto"}
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PAY MODAL
════════════════════════════════════════════════════════════ */
function PayModal({total,onClose,onPay}){
  const [mode,setMode]=useState("efectivo")
  const [cash,setCash]=useState("")
  const [mp,setMp]=useState("")
  const c=parseFloat(cash)||0,m=parseFloat(mp)||0
  const change=mode==="efectivo"?Math.max(0,c-total):mode==="mixto"?Math.max(0,c-(total-m)):0
  const ok=mode==="efectivo"?c>=total:mode==="transferencia"?true:(m+c)>=total

  const N={width:"100%",background:C.card2,border:`1.5px solid ${C.br}`,borderRadius:10,
    color:C.tx,padding:"13px 15px",fontSize:22,outline:"none",
    fontFamily:"'DM Mono',monospace",display:"block",letterSpacing:.5}

  return(
    <div style={{position:"fixed",inset:0,zIndex:800,background:"rgba(91,33,182,.18)",
      display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onClose}>
      <div className="fadeUp" style={{background:C.card,borderRadius:"22px 22px 0 0",
        padding:"24px 20px 32px",width:"100%",maxWidth:500,
        maxHeight:"92vh",overflowY:"auto",position:"relative",
        boxShadow:"0 -8px 40px rgba(91,33,182,.18)"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{width:40,height:4,background:C.br,borderRadius:4,
          margin:"-8px auto 18px"}}/>
        <button onClick={onClose} style={{position:"absolute",top:18,right:18,
          background:C.vbg,border:"none",color:C.vm,width:32,height:32,
          borderRadius:10,fontSize:16,display:"flex",
          alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>

        <p style={{fontSize:11,fontWeight:700,color:C.tx3,letterSpacing:1,marginBottom:2}}>
          COBRAR VENTA
        </p>
        <p style={{fontFamily:"'DM Mono',monospace",fontSize:34,fontWeight:700,
          color:C.tx,marginBottom:20,letterSpacing:.5}}>{$(total)}</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
          {[{k:"efectivo",i:"💵",l:"Efectivo"},{k:"transferencia",i:"📲",l:"Transfer"},{k:"mixto",i:"🔀",l:"Mixto"}].map(({k,i,l})=>(
            <button key={k} onClick={()=>setMode(k)}
              style={{padding:"12px 4px",borderRadius:12,
              background:mode===k?`linear-gradient(135deg,${C.v},${C.vm})`:C.card2,
              color:mode===k?"#fff":C.tx2,
              border:`1.5px solid ${mode===k?C.vm:C.br}`,
              fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13,
              boxShadow:mode===k?`0 4px 14px ${C.v}44`:"none"}}>
              <div style={{fontSize:20,marginBottom:2}}>{i}</div>
              {l}
            </button>
          ))}
        </div>

        {(mode==="efectivo"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.tx2,
              letterSpacing:.6,marginBottom:7}}>
              {mode==="mixto"?"💵 MONTO EFECTIVO":"MONTO RECIBIDO"}
            </label>
            <input type="number" value={cash} onChange={e=>setCash(e.target.value)}
              placeholder="0" style={N} autoFocus
              onFocus={e=>e.target.style.borderColor=C.ok}
              onBlur={e=>e.target.style.borderColor=C.br}/>
          </div>
        )}

        {(mode==="transferencia"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.tx2,
              letterSpacing:.6,marginBottom:7}}>📲 MONTO MP / TRANSFER</label>
            {mode==="transferencia"
              ?<div style={{padding:"13px 15px",background:C.blbg,
                  border:`1.5px solid ${C.bl}44`,borderRadius:10,
                  fontFamily:"'DM Mono',monospace",color:C.bl,fontSize:22}}>{$(total)}</div>
              :<input type="number" value={mp} onChange={e=>setMp(e.target.value)}
                  placeholder="0" style={N}
                  onFocus={e=>e.target.style.borderColor=C.bl}
                  onBlur={e=>e.target.style.borderColor=C.br}/>
            }
          </div>
        )}

        {mode==="mixto"&&m>0&&(
          <div style={{background:C.vbg,borderRadius:12,padding:"11px 15px",marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,color:C.tx2,letterSpacing:.6,marginBottom:4}}>
              EFECTIVO REQUERIDO
            </p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:22,color:C.v,fontWeight:700}}>
              {$(Math.max(0,total-m))}
            </p>
          </div>
        )}

        {(mode==="efectivo"||mode==="mixto")&&c>0&&(
          <div style={{background:change>0?C.okbg:C.erbg,
            border:`1.5px solid ${change>0?C.ok:C.er}33`,
            borderRadius:12,padding:"12px 15px",marginBottom:16}}>
            <p style={{fontSize:11,fontWeight:700,color:C.tx2,letterSpacing:.6,marginBottom:4}}>
              VUELTO
            </p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:32,fontWeight:700,
              color:change>0?C.ok:C.er}}>{$(change)}</p>
            {change<0&&<p style={{fontSize:13,color:C.er,marginTop:4,fontWeight:600}}>
              ⚠️ Monto insuficiente
            </p>}
          </div>
        )}

        <button onClick={()=>ok&&onPay({mode,cashPaid:c,mpPaid:mode==="transferencia"?total:m,change})}
          disabled={!ok}
          style={{width:"100%",
          background:ok?`linear-gradient(135deg,${C.v},${C.vm})`:"#d1c9e8",
          color:ok?"#fff":"#9b90b8",border:"none",borderRadius:12,padding:"16px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:17,
          boxShadow:ok?`0 5px 18px ${C.v}44`:"none"}}>
          Confirmar venta
        </button>
      </div>
    </div>
  )
}

/* ─── Delete confirm ─────────────────────────────────────── */
function Del({name,onYes,onNo}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(91,33,182,.18)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="fadeUp" style={{background:C.card,borderRadius:20,padding:28,
        maxWidth:320,width:"100%",textAlign:"center",
        boxShadow:C.shM,border:`1px solid ${C.br}`}}>
        <div style={{width:56,height:56,background:C.erbg,borderRadius:16,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:26,margin:"0 auto 14px"}}>🗑️</div>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:8}}>Eliminar producto</h3>
        <p style={{color:C.tx2,fontSize:14,marginBottom:22,lineHeight:1.5}}>
          ¿Eliminar <b>"{name}"</b>?
        </p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onNo} style={{flex:1,padding:"12px 0",background:C.card2,
            border:`1.5px solid ${C.br}`,borderRadius:10,color:C.tx2,
            fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:15}}>
            Cancelar
          </button>
          <button onClick={onYes} style={{flex:1,padding:"12px 0",
            background:`linear-gradient(135deg,${C.er},#b91c1c)`,
            border:"none",borderRadius:10,color:"#fff",
            fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:15,
            boxShadow:`0 4px 14px ${C.er}40`}}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN
════════════════════════════════════════════════════════════ */
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
  const [search,setSearch]=useState("")

  useEffect(()=>{
    const h=()=>setMobile(window.innerWidth<768)
    window.addEventListener("resize",h)
    return()=>window.removeEventListener("resize",h)
  },[])

  useEffect(()=>onAuthStateChanged(auth,u=>setUser(u||null)),[])

  const prodsCol=user?collection(db,`users/${user.uid}/products`):null
  const salesCol=user?collection(db,`users/${user.uid}/sales`):null

  // load products
  useEffect(()=>{
    if(!user||!prodsCol)return
    setLoadP(true)
    getDocs(prodsCol)
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0))
        setProds(list)
      }).catch(console.warn).finally(()=>setLoadP(false))
  },[user])

  // load sales
  useEffect(()=>{
    if(!user||!salesCol||tab!=="hist")return
    setLoadS(true)
    getDocs(query(salesCol,where("date","==",date)))
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0))
        setSales(list)
      }).catch(console.warn).finally(()=>setLoadS(false))
  },[user,tab,date])

  // cart
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

  // save product optimistic
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

  // delete optimistic
  const delProd=id=>{
    if(!user)return
    setProds(prev=>prev.filter(p=>p.id!==id))
    setCart(prev=>prev.filter(i=>i.id!==id))
    setDelModal(null);toast("Producto eliminado")
    if(!id.startsWith("_"))deleteDoc(doc(db,`users/${user.uid}/products`,id)).catch(console.warn)
  }

  // pay optimistic
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

  const st={
    total:sales.reduce((s,v)=>s+v.total,0),
    ef:sales.reduce((s,v)=>s+(v.cash_paid||0),0),
    mp:sales.reduce((s,v)=>s+(v.mp_paid||0),0),
    items:sales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0),
    count:sales.length,
  }
  const mLabel=s=>{
    if(s.method==="efectivo")return{l:"💵 Efectivo",c:C.ok,bg:C.okbg}
    if(s.method==="transferencia")return{l:"📲 Transfer",c:C.bl,bg:C.blbg}
    return{l:"🔀 Mixto",c:C.am,bg:C.ambg}
  }
  const goDay=d=>{const x=new Date(date);x.setDate(x.getDate()+d);setDate(x.toISOString().split("T")[0])}
  const isToday=date===today()

  // loading
  if(user===undefined){
    return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <style>{CSS}</style>
        <img src="/logo.png" style={{height:70,objectFit:"contain"}}/>
        <Spin s={28}/>
      </div>
    )
  }

  if(!user)return(<><style>{CSS}</style><AuthScreen/></>)

  // product grid
  const filteredProds=prods.filter(p=>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const ProdGrid=()=>(
    <div style={{padding:"18px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:16,gap:8}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:800,color:C.tx,margin:0}}>Productos</h2>
          <p style={{fontSize:12,color:C.tx3,margin:0}}>{prods.length} artículos</p>
        </div>
        <button onClick={()=>setProdModal({p:null})}
          style={{background:`linear-gradient(135deg,${C.v},${C.vm})`,color:"#fff",
          border:"none",borderRadius:12,padding:"10px 16px",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,
          boxShadow:`0 4px 14px ${C.v}44`,display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
          <span style={{fontSize:18,lineHeight:1}}>+</span> Agregar
        </button>
      </div>

      {/* SEARCH BAR */}
      <div style={{position:"relative",marginBottom:16}}>
        <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",
          fontSize:16,pointerEvents:"none",color:C.tx3}}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Buscar producto..."
          style={{width:"100%",background:C.card,border:`1.5px solid ${C.br}`,
          borderRadius:12,color:C.tx,padding:"11px 36px 11px 40px",fontSize:15,
          outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box"}}
          onFocus={e=>{e.target.style.borderColor=C.vm;e.target.style.boxShadow=`0 0 0 3px ${C.vl}28`}}
          onBlur={e=>{e.target.style.borderColor=C.br;e.target.style.boxShadow="none"}}
        />
        {search&&(
          <button onClick={()=>setSearch("")}
            style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",color:C.tx3,fontSize:18,
            display:"flex",alignItems:"center",padding:4}}>✕</button>
        )}
      </div>

      {loadP?(
        <div style={{display:"flex",justifyContent:"center",padding:70}}><Spin s={32}/></div>
      ):filteredProds.length===0&&search?(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.tx3}}>
          <div style={{fontSize:36,marginBottom:10}}>🔍</div>
          <p style={{fontSize:14,fontWeight:600,color:C.tx2}}>Sin resultados para "{search}"</p>
        </div>
      ):prods.length===0&&!search?(
        <div style={{textAlign:"center",padding:"50px 20px",color:C.tx3}}>
          <div style={{width:72,height:72,background:C.vbg,borderRadius:22,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:32,margin:"0 auto 14px"}}>📦</div>
          <h3 style={{fontSize:15,fontWeight:700,color:C.tx2,marginBottom:6}}>Sin productos</h3>
          <p style={{fontSize:13}}>Tocá "+ Agregar" para empezar</p>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:12}}>
          {filteredProds.map(p=>(
            <div key={p.id} style={{background:C.card,border:`1.5px solid ${C.br}`,
              borderRadius:16,overflow:"hidden",position:"relative",
              boxShadow:C.sh}}>
              <div style={{position:"absolute",top:7,right:7,display:"flex",gap:4,zIndex:5}}>
                <button onClick={e=>{e.stopPropagation();setProdModal({p})}}
                  style={{background:"rgba(255,255,255,.92)",border:`1px solid ${C.br}`,
                  borderRadius:8,color:C.vm,width:28,height:28,display:"flex",
                  alignItems:"center",justifyContent:"center",fontSize:13}}>✏️</button>
                <button onClick={e=>{e.stopPropagation();setDelModal(p)}}
                  style={{background:"rgba(255,255,255,.92)",border:`1px solid ${C.br}`,
                  borderRadius:8,color:C.er,width:28,height:28,display:"flex",
                  alignItems:"center",justifyContent:"center",fontSize:13}}>🗑️</button>
              </div>
              <div onClick={()=>addItem(p)}>
                <div style={{paddingTop:"72%",position:"relative",overflow:"hidden",background:C.vbg}}>
                  <img src={p.img} alt={p.name}
                    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
                    onError={e=>{e.target.src=FALLBACK}}/>
                </div>
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.tx,lineHeight:1.3,marginBottom:3}}>
                    {p.name}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700,color:C.v}}>
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

  // cart panel
  const CartPanel=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:C.card}}>
      <div style={{padding:"14px 16px 10px",borderBottom:`1.5px solid ${C.br}`,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{fontSize:15,fontWeight:800,color:C.tx,margin:0,
          display:"flex",alignItems:"center",gap:8}}>
          Carrito
          {cartQty>0&&<span style={{background:`linear-gradient(135deg,${C.v},${C.vm})`,
            color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:12,fontWeight:700}}>
            {cartQty}
          </span>}
        </h3>
        {cart.length>0&&
          <button onClick={()=>setCart([])}
            style={{background:C.erbg,border:`1px solid ${C.er}22`,borderRadius:8,
            color:C.er,padding:"5px 12px",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600}}>
            Vaciar
          </button>
        }
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {cart.length===0?(
          <div style={{textAlign:"center",padding:"46px 20px",color:C.tx3}}>
            <div style={{width:60,height:60,background:C.vbg,borderRadius:18,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:26,margin:"0 auto 12px"}}>🛒</div>
            <p style={{fontSize:13,fontWeight:500,lineHeight:1.6}}>
              Tocá un producto<br/>para agregar
            </p>
          </div>
        ):cart.map(it=>(
          <div key={it.id} style={{display:"flex",alignItems:"center",
            padding:"10px 14px",borderBottom:`1px solid ${C.br}`,gap:10}}>
            <img src={it.img} alt={it.name}
              style={{width:40,height:40,borderRadius:9,objectFit:"cover",
              flexShrink:0,border:`1px solid ${C.br}`}}
              onError={e=>{e.target.src=FALLBACK}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:C.tx,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {it.name}
              </div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                color:C.v,fontWeight:700}}>{$(it.price*it.qty)}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
              <button onClick={()=>setQty(it.id,it.qty-1)}
                style={{width:30,height:30,background:C.card2,border:`1.5px solid ${C.br}`,
                borderRadius:8,color:C.tx2,fontSize:20,display:"flex",
                alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:C.tx,
                minWidth:22,textAlign:"center",fontWeight:700}}>{it.qty}</span>
              <button onClick={()=>setQty(it.id,it.qty+1)}
                style={{width:30,height:30,background:C.vbg,border:`1.5px solid ${C.vl}`,
                borderRadius:8,color:C.vm,fontSize:20,display:"flex",
                alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{borderTop:`1.5px solid ${C.br}`,padding:"15px 15px 18px",background:C.card2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:13}}>
          <span style={{fontSize:14,fontWeight:600,color:C.tx2}}>Total</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:700,color:C.tx}}>
            {$(cartTotal)}
          </span>
        </div>
        <button onClick={()=>cart.length?setPayModal(true):toast("Carrito vacío")}
          style={{width:"100%",
          background:cart.length?`linear-gradient(135deg,${C.v},${C.vm})`:"#d1c9e8",
          color:cart.length?"#fff":"#9b90b8",border:"none",borderRadius:12,padding:"16px 0",
          fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:18,
          boxShadow:cart.length?`0 5px 18px ${C.v}44`:"none"}}>
          Cobrar
        </button>
      </div>
    </div>
  )

  return(
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:C.bg,color:C.tx}}>

        {/* HEADER */}
        <header style={{background:C.card,borderBottom:`1px solid ${C.br}`,
          padding:"0 16px",display:"flex",alignItems:"center",
          justifyContent:"space-between",height:62,position:"sticky",top:0,
          zIndex:100,boxShadow:`0 1px 16px rgba(91,33,182,.08)`,gap:10}}>

          <img src="/logo.png" alt="MAGO" style={{height:44,objectFit:"contain"}}/>

          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {[["caja","🏪","CAJA"],["hist","📊","HISTORIAL"]].map(([k,ic,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{background:tab===k?`linear-gradient(135deg,${C.v},${C.vm})`:C.vbg,
                color:tab===k?"#fff":C.tx2,
                border:`1.5px solid ${tab===k?C.vm:C.br}`,borderRadius:10,
                padding:"8px 12px",fontFamily:"'DM Sans',sans-serif",fontWeight:700,
                fontSize:12,boxShadow:tab===k?`0 3px 12px ${C.v}44`:"none",
                display:"flex",alignItems:"center",gap:4}}>
                <span>{ic}</span><span style={{display:mobile?"none":"inline"}}> {l}</span>
                {mobile&&<span>{l}</span>}
              </button>
            ))}

            <div style={{display:"flex",alignItems:"center",gap:6,
              marginLeft:4,paddingLeft:10,borderLeft:`1px solid ${C.br}`}}>
              <div style={{width:30,height:30,
                background:`linear-gradient(135deg,${C.v},${C.vm})`,
                borderRadius:9,display:"flex",alignItems:"center",
                justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>
                {(user.displayName||user.email||"?")[0].toUpperCase()}
              </div>
              <button onClick={async()=>{
                await signOut(auth);setProds([]);setCart([]);setSales([])
              }} style={{background:C.erbg,border:`1px solid ${C.er}22`,borderRadius:8,
                color:C.er,padding:"6px 10px",fontFamily:"'DM Sans',sans-serif",
                fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* CAJA */}
        {tab==="caja"&&(mobile?(
          <div style={{height:"calc(100vh - 62px)",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.br}`}}>
              {[["prods","🏪 Productos"],["cart",`🛒 Carrito (${cartQty})`]].map(([v,l])=>(
                <button key={v} onClick={()=>setMView(v)}
                  style={{flex:1,padding:"12px 0",background:"transparent",
                  color:mView===v?C.vm:C.tx3,border:"none",
                  borderBottom:`3px solid ${mView===v?C.vm:"transparent"}`,
                  fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:13}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{flex:1,overflow:"auto",WebkitOverflowScrolling:"touch"}}>
              {mView==="prods"?<ProdGrid/>:<CartPanel/>}
            </div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 315px",
            height:"calc(100vh - 62px)",overflow:"hidden"}}>
            <div style={{overflowY:"auto",background:C.bg}}><ProdGrid/></div>
            <div style={{borderLeft:`1px solid ${C.br}`,overflow:"hidden"}}><CartPanel/></div>
          </div>
        ))}

        {/* HISTORIAL */}
        {tab==="hist"&&(
          <div style={{maxWidth:860,margin:"0 auto",padding:"22px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:20,flexWrap:"wrap",gap:12}}>
              <div>
                <h2 style={{fontSize:22,fontWeight:800,color:C.tx,margin:0}}>Historial</h2>
                <p style={{fontSize:12,color:C.tx3,margin:0}}>{st.count} ventas registradas</p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:C.card,
                border:`1.5px solid ${C.br}`,borderRadius:14,padding:"6px 8px",boxShadow:C.sh}}>
                <button onClick={()=>goDay(-1)}
                  style={{background:C.vbg,border:"none",borderRadius:9,color:C.vm,
                  width:32,height:32,fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  style={{background:"transparent",border:"none",color:C.tx,
                  fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:500,
                  outline:"none",minWidth:120,textAlign:"center"}}/>
                <button onClick={()=>goDay(1)} disabled={isToday}
                  style={{background:isToday?C.card2:C.vbg,border:"none",borderRadius:9,
                  color:isToday?C.tx3:C.vm,width:32,height:32,
                  fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
                {!isToday&&
                  <button onClick={()=>setDate(today())}
                    style={{background:`linear-gradient(135deg,${C.v},${C.vm})`,border:"none",
                    borderRadius:9,color:"#fff",padding:"0 12px",height:32,
                    fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}>Hoy</button>
                }
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
              gap:10,marginBottom:22}}>
              {[
                {l:"Total",     v:$(st.total), c:C.v, bg:C.vbg, i:"💰"},
                {l:"Efectivo",  v:$(st.ef),    c:C.ok,bg:C.okbg,i:"💵"},
                {l:"Transfer",  v:$(st.mp),    c:C.bl,bg:C.blbg,i:"📲"},
                {l:"Artículos", v:st.items,    c:C.am,bg:C.ambg,i:"📦"},
                {l:"Ventas",    v:st.count,    c:C.v, bg:C.vbg, i:"🧾"},
              ].map(({l,v,c,bg,i})=>(
                <div key={l} style={{background:bg,border:`1.5px solid ${c}22`,
                  borderRadius:14,padding:"13px 14px",boxShadow:C.sh}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:7}}>
                    <span style={{fontSize:14}}>{i}</span>
                    <span style={{fontSize:10,fontWeight:700,color:C.tx2,letterSpacing:.5}}>
                      {l.toUpperCase()}
                    </span>
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                    fontSize:19,color:c}}>{v}</div>
                </div>
              ))}
            </div>

            {loadS?(
              <div style={{display:"flex",justifyContent:"center",padding:50}}><Spin s={28}/></div>
            ):sales.length===0?(
              <div style={{textAlign:"center",padding:"50px 0",color:C.tx3}}>
                <div style={{width:68,height:68,background:C.vbg,borderRadius:20,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:30,margin:"0 auto 14px"}}>📋</div>
                <h3 style={{fontSize:15,fontWeight:700,color:C.tx2,marginBottom:4}}>Sin ventas este día</h3>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sales.map((s,i)=>{
                  const m=mLabel(s)
                  const ts=(s.created_at?.toDate?s.created_at.toDate():new Date(s.created_at.seconds*1000))
                    .toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
                  return(
                    <div key={s.id} style={{background:C.card,border:`1.5px solid ${C.br}`,
                      borderRadius:14,padding:"13px 16px",boxShadow:C.sh}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:7}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,
                            color:C.tx3,background:C.card2,padding:"2px 7px",borderRadius:6,fontWeight:600}}>
                            #{sales.length-i}
                          </span>
                          <span style={{fontSize:12,color:C.tx3,fontWeight:500}}>{ts}</span>
                          <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",
                            borderRadius:20,background:m.bg,color:m.c}}>{m.l}</span>
                        </div>
                        <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                          fontSize:18,color:C.tx}}>{$(s.total)}</span>
                      </div>
                      <p style={{fontSize:13,color:C.tx2,lineHeight:1.5,
                        marginBottom:(s.change_amount>0||s.method==="mixto")?6:0}}>
                        {(s.items||[]).map(it=>`${it.product_name} ×${it.qty}`).join("  ·  ")}
                      </p>
                      {(s.method==="mixto"||s.change_amount>0)&&(
                        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:5}}>
                          {s.method==="mixto"&&<>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:C.ok,background:C.okbg,padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                              💵 {$(s.cash_paid)}
                            </span>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:C.bl,background:C.blbg,padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                              📲 {$(s.mp_paid)}
                            </span>
                          </>}
                          {s.change_amount>0&&
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:C.am,background:C.ambg,padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                              ↩ {$(s.change_amount)}
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
