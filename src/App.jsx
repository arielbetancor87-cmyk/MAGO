import { useState, useEffect, useRef } from "react"
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, Timestamp
} from "firebase/firestore"
import {
  onAuthStateChanged, signInWithPopup,
  signInWithRedirect, getRedirectResult, signOut
} from "firebase/auth"
import { db, auth, googleProvider } from "./lib/firebase.js"

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

/* ─── palette ────────────────────────────────────────────────────────── */
const P={
  bg:"#f5f3ff",card:"#fff",card2:"#faf9ff",
  br:"#e8e3f8",br2:"#d4ccf0",
  v:"#6d28d9",vl:"#7c3aed",vx:"#a78bfa",vbg:"#ede9fe",
  tx:"#1a1030",tx2:"#5a5070",tx3:"#9890aa",
  ok:"#059669",okbg:"#d1fae5",
  bl:"#2563eb",blbg:"#dbeafe",
  am:"#d97706",ambg:"#fef3c7",
  er:"#dc2626",erbg:"#fee2e2",
}

/* ─── Toast ──────────────────────────────────────────────────────────── */
let _tt
function useToast(){
  const [t,setT]=useState({m:"",on:false,err:false})
  const show=(m,err=false)=>{
    clearTimeout(_tt)
    setT({m,on:true,err})
    _tt=setTimeout(()=>setT(x=>({...x,on:false})),2200)
  }
  const el=(
    <div style={{position:"fixed",bottom:26,left:"50%",
      transform:`translateX(-50%) translateY(${t.on?0:12}px)`,
      opacity:t.on?1:0,transition:"all .2s",
      background:t.err?P.er:P.v,color:"#fff",
      fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
      fontSize:15,letterSpacing:1,padding:"10px 22px",
      borderRadius:10,pointerEvents:"none",zIndex:9999,
      whiteSpace:"nowrap",boxShadow:"0 6px 24px #6d28d950"}}>
      {t.m}
    </div>
  )
  return{show,el}
}

/* ─── LoginScreen ────────────────────────────────────────────────────── */
function LoginScreen({onLogin,loading}){
  const isMobile=/iPhone|Android|iPad/i.test(navigator.userAgent)

  const handleGoogle=async()=>{
    try{
      if(isMobile){
        await signInWithRedirect(auth,googleProvider)
      }else{
        await signInWithPopup(auth,googleProvider)
      }
    }catch(e){
      console.error(e)
      // fallback to redirect on popup block
      try{ await signInWithRedirect(auth,googleProvider) }catch(_){}
    }
  }

  return(
    <div style={{minHeight:"100vh",background:P.bg,display:"flex",
      flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <img src="/logo.png" alt="MAGO Drinks"
        style={{height:90,objectFit:"contain",marginBottom:32}}/>

      <div style={{background:P.card,borderRadius:24,padding:32,
        maxWidth:360,width:"100%",textAlign:"center",
        boxShadow:"0 8px 40px #6d28d925",border:`1.5px solid ${P.br}`}}>

        <h1 style={{fontFamily:"'Barlow Condensed',sans-serif",color:P.v,
          fontSize:28,fontWeight:900,letterSpacing:3,marginBottom:8}}>
          MAGO DRINKS POS
        </h1>
        <p style={{color:P.tx2,fontSize:14,marginBottom:28,lineHeight:1.6}}>
          Iniciá sesión para acceder a tus productos y ventas guardados
        </p>

        <button onClick={handleGoogle} disabled={loading}
          style={{width:"100%",display:"flex",alignItems:"center",
          justifyContent:"center",gap:12,padding:"14px 0",
          background:loading?P.vbg:P.v,color:loading?P.vl:"#fff",
          border:"none",borderRadius:12,cursor:loading?"wait":"pointer",
          fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
          fontSize:17,letterSpacing:1.5,
          boxShadow:loading?"none":`0 4px 18px ${P.v}44`,
          transition:"all .15s"}}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.9 40.1 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          {loading?"INICIANDO...":"INGRESAR CON GOOGLE"}
        </button>

        <p style={{color:P.tx3,fontSize:12,marginTop:20,lineHeight:1.5}}>
          Tus productos y ventas quedan guardados<br/>en tu cuenta personal
        </p>
      </div>
    </div>
  )
}

/* ─── ProductModal ───────────────────────────────────────────────────── */
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

  const I={width:"100%",background:P.card2,border:`1.5px solid ${P.br}`,borderRadius:8,
    color:P.tx,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}

  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d930",backdropFilter:"blur(4px)",
      zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:P.card,borderRadius:20,padding:26,width:"100%",maxWidth:420,
        boxShadow:"0 8px 40px #6d28d930",maxHeight:"90vh",overflowY:"auto",position:"relative"}}
        onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:P.vbg,
          border:"none",color:P.vl,width:30,height:30,borderRadius:8,cursor:"pointer",
          fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>

        <h2 style={{fontFamily:"'Barlow Condensed',sans-serif",color:P.v,fontSize:22,
          fontWeight:900,letterSpacing:2,margin:"0 0 20px"}}>
          {edit?"✏️ EDITAR":"➕ NUEVO PRODUCTO"}
        </h2>

        {[["Nombre *",name,setName,"Ej: Vodka Skyy 750ml","text"],
          ["Precio *",price,setPrice,"Ej: 8500","number"]].map(([lb,vl,sv,ph,tp])=>(
          <div key={lb} style={{marginBottom:14}}>
            <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",
              color:P.tx2,fontSize:11,letterSpacing:1.5,marginBottom:5,textTransform:"uppercase"}}>{lb}</label>
            <input type={tp} value={vl} onChange={e=>sv(e.target.value)} placeholder={ph}
              min={tp==="number"?0:undefined} style={I}
              onFocus={e=>e.target.style.borderColor=P.v}
              onBlur={e=>e.target.style.borderColor=P.br}/>
          </div>
        ))}

        <div style={{marginBottom:18}}>
          <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",
            color:P.tx2,fontSize:11,letterSpacing:1.5,marginBottom:8,textTransform:"uppercase"}}>FOTO</label>
          {preview&&(
            <div style={{position:"relative",marginBottom:10}}>
              <img src={preview} style={{width:"100%",height:120,objectFit:"cover",
                borderRadius:10,border:`1.5px solid ${P.br}`}}
                onError={e=>e.target.style.display="none"}/>
              <button onClick={()=>{setPreview("");setB64(null);setUrl("")}}
                style={{position:"absolute",top:6,right:6,background:"#fff",border:"none",
                borderRadius:6,color:P.er,width:26,height:26,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✕</button>
            </div>
          )}
          <button onClick={()=>ref.current.click()}
            style={{width:"100%",padding:"10px 0",background:P.vbg,
            border:`1.5px dashed ${P.vx}`,borderRadius:10,color:P.v,
            fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13,
            letterSpacing:1,cursor:"pointer",marginBottom:8,display:"flex",
            alignItems:"center",justifyContent:"center",gap:6}}>
            {busy?"⏳ PROCESANDO...":"📷 SUBIR FOTO"}
          </button>
          <input ref={ref} type="file" accept="image/*" onChange={pickFile} style={{display:"none"}}/>
          <input type="text" value={url}
            onChange={e=>{setUrl(e.target.value);setB64(null);setPreview(e.target.value)}}
            placeholder="o pegá una URL de imagen"
            style={{...I,fontSize:13}}
            onFocus={e=>e.target.style.borderColor=P.v}
            onBlur={e=>e.target.style.borderColor=P.br}/>
        </div>

        {err&&<p style={{color:P.er,fontSize:13,marginBottom:10}}>{err}</p>}

        <button onClick={save} disabled={busy}
          style={{width:"100%",background:busy?P.vx:P.v,color:"#fff",border:"none",
          borderRadius:10,padding:"13px 0",fontFamily:"'Barlow Condensed',sans-serif",
          fontWeight:900,fontSize:17,letterSpacing:2,cursor:busy?"wait":"pointer",
          boxShadow:`0 4px 16px ${P.v}44`}}>
          {edit?"GUARDAR CAMBIOS":"AGREGAR"}
        </button>
      </div>
    </div>
  )
}

/* ─── PayModal ───────────────────────────────────────────────────────── */
function PayModal({total,onClose,onPay}){
  const [mode,setMode]=useState("efectivo")
  const [cash,setCash]=useState("")
  const [mp,setMp]=useState("")
  const c=parseFloat(cash)||0,m=parseFloat(mp)||0
  const change=mode==="efectivo"?Math.max(0,c-total):mode==="mixto"?Math.max(0,c-(total-m)):0
  const ok=mode==="efectivo"?c>=total:mode==="transferencia"?true:(m+c)>=total

  const Btn=({k,icon,label})=>(
    <button onClick={()=>setMode(k)} style={{flex:1,padding:"11px 2px",borderRadius:10,
      background:mode===k?P.v:P.card2,color:mode===k?"#fff":P.tx2,
      border:`1.5px solid ${mode===k?P.v:P.br}`,fontFamily:"'Barlow Condensed',sans-serif",
      fontWeight:700,fontSize:12,letterSpacing:.5,cursor:"pointer",transition:"all .12s"}}>
      {icon} {label}
    </button>
  )
  const N={width:"100%",background:P.card2,border:`1.5px solid ${P.br}`,borderRadius:8,
    color:P.tx,padding:"12px 14px",fontSize:22,outline:"none",
    fontFamily:"'DM Mono',monospace",boxSizing:"border-box",letterSpacing:1}

  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d930",backdropFilter:"blur(4px)",
      zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:P.card,borderRadius:20,padding:24,width:"100%",maxWidth:440,
        boxShadow:"0 8px 40px #6d28d930",position:"relative"}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:P.vbg,
          border:"none",color:P.vl,width:30,height:30,borderRadius:8,cursor:"pointer",
          fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>

        <p style={{fontFamily:"'Barlow Condensed',sans-serif",color:P.v,fontSize:13,
          letterSpacing:2,marginBottom:4}}>COBRAR VENTA</p>
        <p style={{fontFamily:"'DM Mono',monospace",fontSize:34,fontWeight:700,
          color:P.tx,marginBottom:20}}>{$(total)}</p>

        <div style={{display:"flex",gap:8,marginBottom:20}}>
          <Btn k="efectivo"      icon="💵" label="EFECTIVO"/>
          <Btn k="transferencia" icon="📲" label="TRANSFER"/>
          <Btn k="mixto"         icon="🔀" label="MIXTO"/>
        </div>

        {(mode==="efectivo"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",
              color:P.tx2,fontSize:11,letterSpacing:1.5,marginBottom:6}}>
              {mode==="mixto"?"💵 MONTO EFECTIVO":"MONTO RECIBIDO"}
            </label>
            <input type="number" value={cash} onChange={e=>setCash(e.target.value)}
              placeholder="0" style={N} autoFocus
              onFocus={e=>e.target.style.borderColor=P.ok}
              onBlur={e=>e.target.style.borderColor=P.br}/>
          </div>
        )}

        {(mode==="transferencia"||mode==="mixto")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",
              color:P.tx2,fontSize:11,letterSpacing:1.5,marginBottom:6}}>
              📲 MONTO MP / TRANSFER
            </label>
            {mode==="transferencia"
              ?<div style={{padding:"12px 14px",background:P.blbg,
                  border:`1.5px solid ${P.bl}44`,borderRadius:8,
                  fontFamily:"'DM Mono',monospace",color:P.bl,fontSize:22}}>{$(total)}</div>
              :<input type="number" value={mp} onChange={e=>setMp(e.target.value)}
                  placeholder="0" style={N}
                  onFocus={e=>e.target.style.borderColor=P.bl}
                  onBlur={e=>e.target.style.borderColor=P.br}/>
            }
          </div>
        )}

        {mode==="mixto"&&m>0&&(
          <div style={{background:P.vbg,borderRadius:10,padding:"10px 16px",marginBottom:14}}>
            <p style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,letterSpacing:2,
              color:P.tx2,marginBottom:4}}>EFECTIVO REQUERIDO</p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:22,color:P.v,fontWeight:700}}>
              {$(Math.max(0,total-m))}
            </p>
          </div>
        )}

        {(mode==="efectivo"||mode==="mixto")&&c>0&&(
          <div style={{background:change>0?P.okbg:P.erbg,
            border:`1.5px solid ${change>0?P.ok:P.er}44`,
            borderRadius:10,padding:"12px 16px",marginBottom:16}}>
            <p style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,
              letterSpacing:2,color:P.tx2,marginBottom:4}}>VUELTO</p>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:32,fontWeight:700,
              color:change>0?P.ok:P.er}}>{$(change)}</p>
            {change<0&&<p style={{fontSize:12,color:P.er,marginTop:4,
              fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>
              MONTO INSUFICIENTE
            </p>}
          </div>
        )}

        <button onClick={()=>ok&&onPay({mode,cashPaid:c,mpPaid:mode==="transferencia"?total:m,change})}
          disabled={!ok}
          style={{width:"100%",background:ok?P.v:P.br2,color:ok?"#fff":P.tx3,
          border:"none",borderRadius:10,padding:"15px 0",
          fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,
          letterSpacing:2,cursor:ok?"pointer":"not-allowed",
          boxShadow:ok?`0 4px 16px ${P.v}44`:"none",transition:"background .15s"}}>
          CONFIRMAR
        </button>
      </div>
    </div>
  )
}

/* ─── DeleteConfirm ──────────────────────────────────────────────────── */
function Del({name,onYes,onNo}){
  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d930",backdropFilter:"blur(3px)",
      zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:P.card,borderRadius:16,padding:28,maxWidth:320,width:"100%",
        textAlign:"center",boxShadow:"0 8px 40px #6d28d930"}}>
        <div style={{fontSize:36,marginBottom:10}}>🗑️</div>
        <p style={{color:P.tx,fontSize:15,marginBottom:22,lineHeight:1.5}}>
          ¿Eliminar <b>"{name}"</b>?
        </p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onNo} style={{flex:1,padding:"11px 0",background:P.card2,
            border:`1px solid ${P.br}`,borderRadius:8,color:P.tx2,
            fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,cursor:"pointer"}}>
            NO
          </button>
          <button onClick={onYes} style={{flex:1,padding:"11px 0",background:P.er,
            border:"none",borderRadius:8,color:"#fff",
            fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,cursor:"pointer"}}>
            ELIMINAR
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  MAIN APP                                                              */
/* ══════════════════════════════════════════════════════════════════════ */
export default function App(){
  const {show:toast,el:toastEl}=useToast()

  /* auth state */
  const [user,setUser]=useState(undefined) // undefined=loading, null=logged out
  const [authLoading,setAuthLoading]=useState(false)

  /* app state */
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

  /* ── auth listener + redirect result ── */
  useEffect(()=>{
    // handle redirect result (mobile Google sign-in)
    getRedirectResult(auth)
      .then(result=>{ if(result?.user) setAuthLoading(false) })
      .catch(()=>{})

    const unsub=onAuthStateChanged(auth,u=>{
      setUser(u||null)
      setAuthLoading(false)
    })
    return unsub
  },[])

  /* ── Firestore paths scoped to user ── */
  const prodsCol=user?collection(db,`users/${user.uid}/products`):null
  const salesCol=user?collection(db,`users/${user.uid}/sales`):null

  /* ── load products when user logs in ── */
  useEffect(()=>{
    if(!user||!prodsCol)return
    setLoadP(true)
    getDocs(prodsCol)
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0))
        setProds(list)
      })
      .catch(e=>console.warn("loadProds",e))
      .finally(()=>setLoadP(false))
  },[user])

  /* ── load sales by date ── */
  useEffect(()=>{
    if(!user||!salesCol||tab!=="hist")return
    setLoadS(true)
    getDocs(query(salesCol,where("date","==",date)))
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}))
        list.sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0))
        setSales(list)
      })
      .catch(e=>console.warn("loadSales",e))
      .finally(()=>setLoadS(false))
  },[user,tab,date])

  /* ── sign in / out ── */
  const handleLogin=async()=>{
    setAuthLoading(true)
    const isMob=/iPhone|Android|iPad/i.test(navigator.userAgent)
    try{
      if(isMob){ await signInWithRedirect(auth,googleProvider) }
      else { await signInWithPopup(auth,googleProvider); setAuthLoading(false) }
    }catch(e){
      console.error(e)
      try{ await signInWithRedirect(auth,googleProvider) }catch(_){ setAuthLoading(false) }
    }
  }

  const handleLogout=async()=>{
    await signOut(auth)
    setProds([]); setCart([]); setSales([])
    toast("Sesión cerrada")
  }

  /* ── cart ── */
  const cartTotal=cart.reduce((s,i)=>s+i.price*i.qty,0)
  const cartQty  =cart.reduce((s,i)=>s+i.qty,0)

  const addItem=p=>{
    setCart(prev=>{
      const ex=prev.find(i=>i.id===p.id)
      return ex?prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...prev,{...p,qty:1}]
    })
    toast(`${p.name} ✓`)
  }
  const setQty=(id,q)=>setCart(prev=>q<=0?prev.filter(i=>i.id!==id):prev.map(i=>i.id===id?{...i,qty:q}:i))

  /* ── save product (optimistic) ── */
  const saveProd=p=>{
    if(!user||!prodsCol)return
    const img=p.img||FALLBACK
    if(p.id){
      setProds(prev=>prev.map(x=>x.id===p.id?{...x,...p,img}:x))
      setProdModal(null); toast(`"${p.name}" actualizado`)
      updateDoc(doc(db,`users/${user.uid}/products`,p.id),{name:p.name,price:p.price,img}).catch(console.warn)
    }else{
      const tmp=uid()
      setProds(prev=>[...prev,{id:tmp,name:p.name,price:p.price,img,created_at:{seconds:Date.now()/1000}}])
      setProdModal(null); toast(`"${p.name}" agregado`)
      addDoc(prodsCol,{name:p.name,price:p.price,img,created_at:Timestamp.now()})
        .then(r=>setProds(prev=>prev.map(x=>x.id===tmp?{...x,id:r.id}:x)))
        .catch(console.warn)
    }
  }

  /* ── delete product (optimistic) ── */
  const delProd=id=>{
    if(!user)return
    setProds(prev=>prev.filter(p=>p.id!==id))
    setCart(prev=>prev.filter(i=>i.id!==id))
    setDelModal(null); toast("Eliminado")
    if(!id.startsWith("_"))
      deleteDoc(doc(db,`users/${user.uid}/products`,id)).catch(console.warn)
  }

  /* ── confirm sale (optimistic) ── */
  const paySale=info=>{
    if(!user||!salesCol)return
    const td=today()
    const sale={
      id:uid(),date:td,total:cartTotal,
      method:info.mode,
      cash_paid:info.cashPaid||0,
      mp_paid:info.mpPaid||0,
      change_amount:info.change||0,
      items:cart.map(i=>({product_name:i.name,product_price:i.price,qty:i.qty})),
      created_at:{seconds:Date.now()/1000,toDate:()=>new Date()},
    }
    if(date===td)setSales(prev=>[sale,...prev])
    setCart([]); setPayModal(false)
    toast("✓ Venta registrada")
    if(mobile)setMView("prods")
    const{id:_,created_at:_c,...fb}=sale
    addDoc(salesCol,{...fb,created_at:Timestamp.now()})
      .then(r=>setSales(prev=>prev.map(s=>s.id===sale.id?{...s,id:r.id}:s)))
      .catch(console.warn)
  }

  /* ── stats ── */
  const st={
    total:sales.reduce((s,v)=>s+v.total,0),
    ef:   sales.reduce((s,v)=>s+(v.cash_paid||0),0),
    mp:   sales.reduce((s,v)=>s+(v.mp_paid||0),0),
    items:sales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0),
    count:sales.length,
  }
  const mLabel=s=>{
    if(s.method==="efectivo")      return{l:"💵 EFECTIVO",c:P.ok,bg:P.okbg}
    if(s.method==="transferencia") return{l:"📲 TRANSFER",c:P.bl,bg:P.blbg}
    return{l:"🔀 MIXTO",c:P.am,bg:P.ambg}
  }

  const goDay=d=>{const x=new Date(date);x.setDate(x.getDate()+d);setDate(x.toISOString().split("T")[0])}
  const isToday=date===today()

  /* ── loading screen ── */
  if(user===undefined){
    return(
      <div style={{minHeight:"100vh",background:P.bg,display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <img src="/logo.png" style={{height:70,objectFit:"contain"}}/>
        <p style={{fontFamily:"'Barlow Condensed',sans-serif",color:P.tx3,
          fontSize:15,letterSpacing:2}}>CARGANDO...</p>
      </div>
    )
  }

  /* ── login screen ── */
  if(!user){
    return <LoginScreen onLogin={handleLogin} loading={authLoading}/>
  }

  /* ── product grid ── */
  const ProdGrid=()=>(
    <div style={{padding:"18px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:16,gap:8}}>
        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,
          fontSize:18,letterSpacing:3,color:P.tx2}}>
          PRODUCTOS ({prods.length})
        </span>
        <button onClick={()=>setProdModal({p:null})}
          style={{background:P.v,color:"#fff",border:"none",borderRadius:9,
          padding:"9px 18px",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
          fontSize:14,letterSpacing:1.5,cursor:"pointer",
          boxShadow:`0 3px 14px ${P.v}44`,flexShrink:0}}>
          + AGREGAR
        </button>
      </div>

      {loadP?(
        <div style={{textAlign:"center",padding:60,color:P.tx3,
          fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,letterSpacing:2}}>
          CARGANDO PRODUCTOS...
        </div>
      ):prods.length===0?(
        <div style={{textAlign:"center",padding:50,color:P.tx3}}>
          <div style={{fontSize:44,marginBottom:10}}>📦</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,letterSpacing:2}}>
            SIN PRODUCTOS<br/><span style={{fontSize:13,fontWeight:400}}>Tocá "+ AGREGAR"</span>
          </div>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:12}}>
          {prods.map(p=>(
            <div key={p.id}
              style={{background:P.card,border:`1.5px solid ${P.br}`,borderRadius:14,
              overflow:"hidden",position:"relative",
              boxShadow:"0 2px 8px #6d28d915",
              transition:"transform .1s,box-shadow .1s",cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 6px 20px ${P.v}25`}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 8px #6d28d915"}}>

              <div style={{position:"absolute",top:6,right:6,display:"flex",gap:4,zIndex:5}}>
                <button onClick={e=>{e.stopPropagation();setProdModal({p})}}
                  style={{background:"#ffffffee",border:`1px solid ${P.br}`,borderRadius:6,
                  color:P.v,width:26,height:26,cursor:"pointer",fontSize:12,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
                <button onClick={e=>{e.stopPropagation();setDelModal(p)}}
                  style={{background:"#ffffffee",border:`1px solid ${P.br}`,borderRadius:6,
                  color:P.er,width:26,height:26,cursor:"pointer",fontSize:12,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>
              </div>

              <div onClick={()=>addItem(p)} style={{WebkitTapHighlightColor:"transparent"}}>
                <div style={{paddingTop:"72%",position:"relative",overflow:"hidden",background:P.vbg}}>
                  <img src={p.img} alt={p.name}
                    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
                    onError={e=>{e.target.src=FALLBACK}}/>
                </div>
                <div style={{padding:"9px 11px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:P.tx,lineHeight:1.3,marginBottom:3}}>
                    {p.name}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700,color:P.v}}>
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

  /* ── cart panel ── */
  const CartPanel=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:P.card}}>
      <div style={{padding:"13px 14px 10px",borderBottom:`1.5px solid ${P.br}`,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,
          fontSize:15,letterSpacing:2,color:P.tx2}}>
          CARRITO
          {cartQty>0&&<span style={{marginLeft:8,background:P.vbg,color:P.v,
            borderRadius:20,padding:"2px 8px",fontSize:13,fontWeight:700}}>{cartQty}</span>}
        </span>
        {cart.length>0&&
          <button onClick={()=>setCart([])}
            style={{background:P.erbg,border:`1px solid ${P.er}33`,borderRadius:6,
            color:P.er,padding:"4px 10px",cursor:"pointer",
            fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,fontWeight:700,letterSpacing:1}}>
            VACIAR
          </button>
        }
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {cart.length===0?(
          <div style={{textAlign:"center",padding:"44px 16px",color:P.tx3}}>
            <div style={{fontSize:44,marginBottom:10}}>🛒</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,letterSpacing:1}}>
              TOCÁ UN PRODUCTO<br/>PARA AGREGAR
            </div>
          </div>
        ):cart.map(it=>(
          <div key={it.id} style={{display:"flex",alignItems:"center",
            padding:"9px 14px",borderBottom:`1px solid ${P.br}`,gap:9}}>
            <img src={it.img} alt={it.name}
              style={{width:38,height:38,borderRadius:7,objectFit:"cover",
              flexShrink:0,border:`1px solid ${P.br}`}}
              onError={e=>{e.target.src=FALLBACK}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:P.tx,whiteSpace:"nowrap",
                overflow:"hidden",textOverflow:"ellipsis"}}>{it.name}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:P.v,fontWeight:700}}>
                {$(it.price*it.qty)}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              <button onClick={()=>setQty(it.id,it.qty-1)}
                style={{width:30,height:30,background:P.card2,border:`1.5px solid ${P.br}`,
                borderRadius:7,color:P.tx2,fontSize:20,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:P.tx,
                minWidth:22,textAlign:"center",fontWeight:700}}>{it.qty}</span>
              <button onClick={()=>setQty(it.id,it.qty+1)}
                style={{width:30,height:30,background:P.vbg,border:`1.5px solid ${P.vx}`,
                borderRadius:7,color:P.v,fontSize:20,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{borderTop:`1.5px solid ${P.br}`,padding:"14px 14px 16px",background:P.card2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",color:P.tx2,fontSize:13,letterSpacing:2}}>TOTAL</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:30,fontWeight:700,color:P.tx}}>{$(cartTotal)}</span>
        </div>
        <button onClick={()=>cart.length?setPayModal(true):toast("Carrito vacío")}
          style={{width:"100%",background:cart.length?P.v:"#ccc",
          color:cart.length?"#fff":"#999",border:"none",borderRadius:10,padding:"15px 0",
          fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,letterSpacing:2,
          cursor:cart.length?"pointer":"not-allowed",
          boxShadow:cart.length?`0 4px 18px ${P.v}55`:"none",
          transition:"background .15s"}}>
          COBRAR
        </button>
      </div>
    </div>
  )

  /* ── main render ── */
  return(
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>

      <div style={{minHeight:"100vh",background:P.bg,fontFamily:"'DM Sans',sans-serif",color:P.tx}}>

        {/* HEADER */}
        <header style={{background:P.card,borderBottom:`1.5px solid ${P.br}`,
          padding:"0 16px",display:"flex",alignItems:"center",
          justifyContent:"space-between",height:62,position:"sticky",top:0,
          zIndex:100,boxShadow:"0 2px 10px #6d28d912",gap:10}}>

          <img src="/logo.png" alt="MAGO" style={{height:46,objectFit:"contain"}}/>

          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {[["caja","CAJA"],["hist","HISTORIAL"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{background:tab===k?P.v:P.vbg,color:tab===k?"#fff":P.v,
                border:`1.5px solid ${tab===k?P.v:P.vx+"55"}`,borderRadius:9,
                padding:"7px 14px",fontFamily:"'Barlow Condensed',sans-serif",
                fontWeight:700,fontSize:13,letterSpacing:1.5,cursor:"pointer",
                transition:"all .12s",
                boxShadow:tab===k?`0 3px 12px ${P.v}44`:"none"}}>
                {l}
              </button>
            ))}

            {/* user avatar + logout */}
            <div style={{display:"flex",alignItems:"center",gap:6,
              marginLeft:4,borderLeft:`1px solid ${P.br}`,paddingLeft:10}}>
              {user.photoURL&&
                <img src={user.photoURL} alt=""
                  style={{width:30,height:30,borderRadius:"50%",
                  border:`2px solid ${P.vbg}`}}/>
              }
              <button onClick={handleLogout}
                style={{background:P.erbg,border:`1px solid ${P.er}33`,borderRadius:7,
                color:P.er,padding:"5px 10px",cursor:"pointer",
                fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,
                fontWeight:700,letterSpacing:1,whiteSpace:"nowrap"}}>
                SALIR
              </button>
            </div>
          </div>
        </header>

        {/* CAJA */}
        {tab==="caja"&&(mobile?(
          <div style={{height:"calc(100vh - 62px)",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",background:P.card,borderBottom:`1.5px solid ${P.br}`}}>
              {[["prods","PRODUCTOS"],["cart",`CARRITO (${cartQty})`]].map(([v,l])=>(
                <button key={v} onClick={()=>setMView(v)}
                  style={{flex:1,padding:"11px 0",background:"transparent",
                  color:mView===v?P.v:P.tx3,border:"none",
                  borderBottom:`3px solid ${mView===v?P.v:"transparent"}`,
                  fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
                  fontSize:13,letterSpacing:1.5,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{flex:1,overflow:"auto"}}>
              {mView==="prods"?<ProdGrid/>:<CartPanel/>}
            </div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 310px",
            height:"calc(100vh - 62px)",overflow:"hidden"}}>
            <div style={{overflowY:"auto",background:P.bg}}><ProdGrid/></div>
            <div style={{borderLeft:`1.5px solid ${P.br}`,overflow:"hidden"}}><CartPanel/></div>
          </div>
        ))}

        {/* HISTORIAL */}
        {tab==="hist"&&(
          <div style={{maxWidth:860,margin:"0 auto",padding:"24px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:20,flexWrap:"wrap",gap:10}}>
              <h2 style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,
                fontSize:26,letterSpacing:3,color:P.v,margin:0}}>HISTORIAL</h2>
              <div style={{display:"flex",alignItems:"center",gap:6,background:P.card,
                border:`1.5px solid ${P.br}`,borderRadius:12,padding:"5px 8px",
                boxShadow:"0 1px 4px #6d28d918"}}>
                <button onClick={()=>goDay(-1)}
                  style={{background:P.vbg,border:"none",borderRadius:7,color:P.v,
                  width:30,height:30,cursor:"pointer",fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  style={{background:"transparent",border:"none",color:P.tx,
                  fontFamily:"'DM Mono',monospace",fontSize:13,outline:"none",
                  cursor:"pointer",minWidth:120,textAlign:"center"}}/>
                <button onClick={()=>goDay(1)} disabled={isToday}
                  style={{background:isToday?P.card2:P.vbg,border:"none",borderRadius:7,
                  color:isToday?P.tx3:P.v,width:30,height:30,
                  cursor:isToday?"not-allowed":"pointer",fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
                {!isToday&&
                  <button onClick={()=>setDate(today())}
                    style={{background:P.v,border:"none",borderRadius:7,color:"#fff",
                    padding:"0 10px",height:30,cursor:"pointer",
                    fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,
                    fontWeight:700,letterSpacing:1}}>HOY</button>
                }
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",
              gap:12,marginBottom:24}}>
              {[
                {l:"TOTAL",    v:$(st.total),c:P.v, bg:P.vbg},
                {l:"EFECTIVO", v:$(st.ef),   c:P.ok,bg:P.okbg},
                {l:"TRANSFER", v:$(st.mp),   c:P.bl,bg:P.blbg},
                {l:"ARTÍCULOS",v:st.items,   c:P.am,bg:P.ambg},
                {l:"VENTAS",   v:st.count,   c:P.v, bg:P.vbg},
              ].map(({l,v,c,bg})=>(
                <div key={l} style={{background:bg,border:`1.5px solid ${c}33`,
                  borderRadius:12,padding:"14px 16px",boxShadow:"0 1px 4px #6d28d918"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,
                    letterSpacing:2,color:P.tx2,marginBottom:6}}>{l}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                    fontSize:22,color:c}}>{v}</div>
                </div>
              ))}
            </div>

            {loadS?(
              <div style={{textAlign:"center",padding:50,color:P.tx3,
                fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,letterSpacing:2}}>
                CARGANDO...
              </div>
            ):sales.length===0?(
              <div style={{textAlign:"center",padding:"50px 0",color:P.tx3}}>
                <div style={{fontSize:44,marginBottom:10}}>📋</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,letterSpacing:2}}>
                  SIN VENTAS ESTE DÍA
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sales.map((s,i)=>{
                  const m=mLabel(s)
                  const ts=(s.created_at?.toDate?s.created_at.toDate():new Date(s.created_at.seconds*1000))
                    .toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
                  return(
                    <div key={s.id} style={{background:P.card,border:`1.5px solid ${P.br}`,
                      borderRadius:12,padding:"13px 16px",boxShadow:"0 1px 4px #6d28d915"}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:7}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,
                            color:P.tx3,background:P.card2,padding:"2px 7px",borderRadius:5}}>
                            #{sales.length-i}
                          </span>
                          <span style={{fontFamily:"'Barlow Condensed',sans-serif",
                            fontSize:13,color:P.tx3,letterSpacing:1}}>{ts}</span>
                          <span style={{fontFamily:"'Barlow Condensed',sans-serif",
                            fontSize:11,fontWeight:700,letterSpacing:1,
                            padding:"3px 9px",borderRadius:5,
                            background:m.bg,color:m.c}}>{m.l}</span>
                        </div>
                        <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                          fontSize:19,color:P.tx}}>{$(s.total)}</span>
                      </div>
                      <div style={{fontSize:13,color:P.tx2,
                        marginBottom:(s.change_amount>0||s.method==="mixto")?5:0}}>
                        {(s.items||[]).map(it=>`${it.product_name} x${it.qty}`).join(" · ")}
                      </div>
                      {(s.method==="mixto"||s.change_amount>0)&&(
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:5}}>
                          {s.method==="mixto"&&<>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:P.ok,background:P.okbg,padding:"2px 8px",borderRadius:5}}>
                              💵 {$(s.cash_paid)}
                            </span>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:P.bl,background:P.blbg,padding:"2px 8px",borderRadius:5}}>
                              📲 {$(s.mp_paid)}
                            </span>
                          </>}
                          {s.change_amount>0&&
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                              color:P.am,background:P.ambg,padding:"2px 8px",borderRadius:5}}>
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
