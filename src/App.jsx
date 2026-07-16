import { useState, useEffect, useRef } from "react"
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, Timestamp, setDoc, getDoc, onSnapshot
} from "firebase/firestore"
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth"
import { db, auth } from "./lib/firebase.js"

/* ─── CONFIG ─────────────────────────────────────────────────────────── */
const ADMIN_EMAIL = "ariel.betancor87@gmail.com"
const isAdminEmail = (email) => (email||"").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()

/* ─── HELPERS ────────────────────────────────────────────────────────── */
const $ = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0)
const today = () => new Date().toISOString().split("T")[0]
const uid = () => "_" + Math.random().toString(36).slice(2)
const FALLBACK = "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&q=80"
const fmtDate = (ts) => {
  if (!ts) return "-"
  const d = ts?.toDate ? ts.toDate() : new Date(ts.seconds * 1000)
  return d.toLocaleDateString("es-AR", {day:"2-digit",month:"2-digit",year:"numeric"})
}
const fmtDT = (ts) => {
  if (!ts) return "-"
  const d = ts?.toDate ? ts.toDate() : new Date(ts.seconds * 1000)
  return d.toLocaleString("es-AR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})
}
const nowLocalDT = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2,"0")
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const startOfDayDT = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2,"0")
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00`
}

/* ─── IMAGE COMPRESS ─────────────────────────────────────────────────── */
const compress = (file) => new Promise(ok => {
  const r = new FileReader()
  r.onload = e => {
    const i = new Image()
    i.onload = () => {
      const MAX = 600, c = document.createElement("canvas")
      let w = i.width, h = i.height
      if (w > h) { if (w > MAX) { h = h*MAX/w|0; w = MAX } }
      else        { if (h > MAX) { w = w*MAX/h|0; h = MAX } }
      c.width = w; c.height = h
      c.getContext("2d").drawImage(i, 0, 0, w, h)
      const b = c.toDataURL("image/jpeg", .78)
      ok(b.length < 900000 ? b : "")
    }
    i.onerror = () => ok("")
    i.src = e.target.result
  }
  r.onerror = () => ok("")
  r.readAsDataURL(file)
})

/* ─── DESIGN TOKENS: MIDNIGHT CYBER ─────────────────────────────────── */
const C = {
  bg:    "#060411",
  card:  "#110b29",
  card2: "#19113b",
  br:    "#251b4f",
  v:     "#a78bfa",
  vm:    "#c084fc",
  vl:    "#e9d5ff",
  vbg:   "rgba(167,139,250,0.08)",
  tx:    "#f8fafc",
  tx2:   "#94a3b8",
  tx3:   "#64748b",
  ok:    "#34d399",  okbg: "rgba(52,211,153,0.1)",
  bl:    "#60a5fa",  blbg: "rgba(96,165,250,0.1)",
  am:    "#fbbf24",  ambg: "rgba(251,191,36,0.1)",
  er:    "#f87171",  erbg: "rgba(248,113,113,0.1)",
  gold:  "#fbbf24",  goldbg: "rgba(251,191,36,0.1)",
  sh:    "0 4px 24px rgba(0,0,0,0.6)",
  shM:   "0 12px 40px rgba(167,139,250,0.12)",
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.tx};-webkit-font-smoothing:antialiased}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
input[type=number]{-moz-appearance:textfield}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-thumb{background:${C.br};border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:${C.v}44}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 8px ${C.v}33}50%{box-shadow:0 0 20px ${C.v}66}}
.fadeUp{animation:fadeUp .24s cubic-bezier(0.16,1,0.3,1) both}
button{cursor:pointer;-webkit-appearance:none;appearance:none;transition:all .15s ease}
button:active{opacity:.85;transform:scale(.98)}
`

/* ─── SPINNER ────────────────────────────────────────────────────────── */
const Spin = ({s=20, c=C.v}) => (
  <div style={{width:s, height:s, flexShrink:0,
    border:`2px solid ${c}22`, borderTop:`2px solid ${c}`,
    borderRadius:"50%", animation:"spin .7s linear infinite"}}/>
)

/* ─── TOAST ──────────────────────────────────────────────────────────── */
let _tt
function useToast() {
  const [t, setT] = useState({m:"", on:false, err:false})
  const show = (m, err=false) => {
    clearTimeout(_tt)
    setT({m, on:true, err})
    _tt = setTimeout(() => setT(x => ({...x, on:false})), 2500)
  }
  const el = (
    <div style={{
      position:"fixed", bottom:28, left:"50%", zIndex:9999,
      transform:`translateX(-50%) translateY(${t.on ? 0 : 10}px)`,
      opacity:t.on ? 1 : 0, transition:"opacity .2s, transform .2s",
      background:t.err
        ? `linear-gradient(135deg,${C.er}dd,${C.er}99)`
        : `linear-gradient(135deg,${C.v}dd,${C.vm}99)`,
      color:"#fff", fontFamily:"'DM Sans',sans-serif", fontWeight:600,
      fontSize:14, padding:"11px 22px", borderRadius:50,
      pointerEvents:"none", whiteSpace:"nowrap",
      border:`1px solid ${t.err ? C.er : C.v}66`,
      boxShadow:`0 8px 32px ${t.err ? C.er : C.v}44`,
      display:"flex", alignItems:"center", gap:8,
    }}>
      {t.err ? "⚠️" : "✓"} {t.m}
    </div>
  )
  return {show, el}
}

/* ════════════════════════════════════════════════════════════════════════
   AUTH SCREEN
════════════════════════════════════════════════════════════════════════ */
function AuthScreen() {
  const [mode, setMode]   = useState("login")
  const [name, setName]   = useState("")
  const [email, setEmail] = useState("")
  const [pass, setPass]   = useState("")
  const [pass2, setPass2] = useState("")
  const [showP, setShowP] = useState(false)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState("")

  const errMsg = code => ({
    "auth/email-already-in-use": "Ese email ya está registrado.",
    "auth/invalid-email":        "Email inválido.",
    "auth/weak-password":        "Mínimo 6 caracteres.",
    "auth/user-not-found":       "No existe esa cuenta.",
    "auth/wrong-password":       "Contraseña incorrecta.",
    "auth/invalid-credential":   "Email o contraseña incorrectos.",
    "auth/too-many-requests":    "Demasiados intentos. Esperá un momento.",
  })[code] || "Error. Intentá de nuevo."

  const submit = async () => {
    setErr("")
    if (!email.trim() || !pass) return setErr("Completá todos los campos.")
    if (mode === "register") {
      if (!name.trim())   return setErr("Ingresá tu nombre.")
      if (pass !== pass2) return setErr("Las contraseñas no coinciden.")
      if (pass.length < 6) return setErr("Mínimo 6 caracteres.")
    }
    setBusy(true)
    try {
      if (mode === "register") {
        const cr = await createUserWithEmailAndPassword(auth, email.trim(), pass)
        await updateProfile(cr.user, {displayName: name.trim()})
        await setDoc(doc(db, "users", cr.user.uid), {
          uid: cr.user.uid, email: email.trim().toLowerCase(),
          name: name.trim(), status: "active", plan: "free",
          registered_at: Timestamp.now(), last_login: Timestamp.now(), notes: "",
        })
      } else {
        const cr = await signInWithEmailAndPassword(auth, email.trim(), pass)
        updateDoc(doc(db, "users", cr.user.uid), {last_login: Timestamp.now()}).catch(() => {})
      }
    } catch(e) { setErr(errMsg(e.code)) }
    finally { setBusy(false) }
  }

  const onKey = e => { if (e.key === "Enter") submit() }

  const inputStyle = {
    width:"100%", background:C.card2, border:`1px solid ${C.br}`,
    borderRadius:10, color:C.tx, padding:"13px 16px", fontSize:15,
    outline:"none", fontFamily:"'DM Sans',sans-serif", display:"block",
    transition:"border-color .2s, box-shadow .2s",
  }
  const focusIn  = e => { e.target.style.borderColor = C.v; e.target.style.boxShadow = `0 0 0 3px ${C.v}22` }
  const focusOut = e => { e.target.style.borderColor = C.br; e.target.style.boxShadow = "none" }

  return (
    <div style={{minHeight:"100vh", background:C.bg,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"20px 16px",
      backgroundImage:`radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.07) 0%, transparent 70%)`}}>

      <img src="/logo.png" alt="MAGO Drinks"
        style={{height:72, objectFit:"contain", marginBottom:32,
          filter:"drop-shadow(0 0 24px rgba(167,139,250,0.4))"}}/>

      <div className="fadeUp" style={{background:C.card, borderRadius:20, padding:"28px 24px",
        width:"100%", maxWidth:390, boxShadow:C.shM, border:`1px solid ${C.br}`}}>

        {/* tab switcher */}
        <div style={{display:"flex", background:C.bg, borderRadius:12,
          padding:4, marginBottom:26, border:`1px solid ${C.br}`}}>
          {[["login","Iniciar sesión"],["register","Crear cuenta"]].map(([k,l]) => (
            <button key={k} onClick={() => { setMode(k); setErr("") }}
              style={{flex:1, padding:"10px 0", borderRadius:9, border:"none",
                background: mode===k ? C.card2 : "transparent",
                color: mode===k ? C.v : C.tx3,
                fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:14,
                boxShadow: mode===k ? `0 0 0 1px ${C.br}` : "none",
                transition:"all .18s"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          {mode === "register" && (
            <div>
              <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
                fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1, marginBottom:6,
                textTransform:"uppercase"}}>Nombre</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)}
                placeholder="Tu nombre" style={inputStyle} onKeyDown={onKey}
                onFocus={focusIn} onBlur={focusOut}/>
            </div>
          )}
          <div>
            <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
              fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1, marginBottom:6,
              textTransform:"uppercase"}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="tucuenta@email.com" style={inputStyle} onKeyDown={onKey}
              onFocus={focusIn} onBlur={focusOut}/>
          </div>
          <div>
            <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
              fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1, marginBottom:6,
              textTransform:"uppercase"}}>Contraseña</label>
            <div style={{position:"relative"}}>
              <input type={showP?"text":"password"} value={pass}
                onChange={e=>setPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={{...inputStyle, paddingRight:46}} onKeyDown={onKey}
                onFocus={focusIn} onBlur={focusOut}/>
              <button onClick={() => setShowP(!showP)}
                style={{position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", color:C.tx3, fontSize:18,
                  display:"flex", alignItems:"center", padding:4}}>
                {showP ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          {mode === "register" && (
            <div>
              <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
                fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1, marginBottom:6,
                textTransform:"uppercase"}}>Repetir contraseña</label>
              <input type={showP?"text":"password"} value={pass2}
                onChange={e=>setPass2(e.target.value)}
                placeholder="Repetí la contraseña" style={inputStyle} onKeyDown={onKey}
                onFocus={focusIn} onBlur={focusOut}/>
            </div>
          )}

          {err && (
            <div style={{background:C.erbg, border:`1px solid ${C.er}44`,
              borderRadius:10, padding:"11px 14px", color:C.er, fontSize:14,
              display:"flex", alignItems:"flex-start", gap:8}}>
              ⚠️ {err}
            </div>
          )}

          <button onClick={submit} disabled={busy}
            style={{width:"100%", border:"none", borderRadius:12, padding:"14px 0",
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15,
              color: busy ? C.tx3 : "#0f0a1e",
              background: busy
                ? C.card2
                : `linear-gradient(135deg, ${C.v}, ${C.vm})`,
              boxShadow: busy ? "none" : `0 0 24px ${C.v}55`,
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              marginTop:4}}>
            {busy && <Spin s={18} c={C.tx3}/>}
            {busy ? "..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
          </button>
        </div>
      </div>

      <p style={{marginTop:20, color:C.tx3, fontSize:12, textAlign:"center", lineHeight:1.7,
        fontFamily:"'DM Sans',sans-serif"}}>
        Tus productos y ventas quedan guardados<br/>en tu cuenta personal
      </p>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════════════
   ORDER PAGE  (public — no auth required)
════════════════════════════════════════════════════════════════════════ */
function OrderPage({uid}) {
  const [prods,    setProds]    = useState([])
  const [cart,     setCart]     = useState([])
  const [name,     setName]     = useState("")
  const [notes,    setNotes]    = useState("")
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [err,      setErr]      = useState("")
  const [waNumber, setWaNumber] = useState("")
  const [waUrlSent,setWaUrlSent]= useState("")

  useEffect(() => {
    // Load catalog
    getDocs(collection(db, `users/${uid}/products`))
      .then(s => {
        const list = s.docs.map(d => ({id:d.id,...d.data()}))
        list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0))
        setProds(list)
      })
      .catch(() => setErr("No se pudo cargar el catálogo."))
      .finally(() => setLoading(false))
    // Load business WhatsApp number from user profile
    getDoc(doc(db, "users", uid))
      .then(snap => { if (snap.exists()) setWaNumber(snap.data().wa_number || "") })
      .catch(() => {})
  }, [uid])

  const cartTotal = cart.reduce((s,i) => s+i.price*i.qty, 0)
  const cartQty   = cart.reduce((s,i) => s+i.qty, 0)

  const addItem = p => setCart(prev => {
    const ex = prev.find(i => i.id===p.id)
    return ex ? prev.map(i => i.id===p.id ? {...i,qty:i.qty+1} : i) : [...prev,{...p,qty:1}]
  })
  const setQtyO = (id,q) => setCart(prev =>
    q<=0 ? prev.filter(i=>i.id!==id) : prev.map(i=>i.id===id ? {...i,qty:q} : i)
  )

  const submit = async () => {
    if (!name.trim()) return setErr("Ingresá tu nombre para continuar.")
    if (!cart.length)  return setErr("Agregá al menos un producto.")
    setSending(true); setErr("")

    // Build WhatsApp URL BEFORE the await (iOS blocks window.open after async)
    let waUrl = ""
    if (waNumber) {
      const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0)
      const lines = [
        "*🍹 NUEVO PEDIDO — MAGO Drinks*",
        "",
        `*Cliente:* ${name.trim()}`,
        notes.trim() ? `*Nota:* ${notes.trim()}` : "",
        "",
        "*Pedido:*",
        ...cart.map(i => `• ${i.name} ×${i.qty} — ${money(i.price*i.qty)}`),
        "",
        `*TOTAL: ${money(cartTotal)}*`,
      ].filter(Boolean)
      const msg   = encodeURIComponent(lines.join("\n"))
      const phone = waNumber.replace(/[^0-9]/g, "")
      waUrl = `https://wa.me/${phone}?text=${msg}`
    }

    try {
      await addDoc(collection(db, `users/${uid}/orders`), {
        customer_name: name.trim(),
        notes:         notes.trim(),
        items:         cart.map(i=>({product_name:i.name, product_price:i.price, qty:i.qty})),
        total:         cartTotal,
        status:        "pending",
        lista:         "minorista",
        created_at:    Timestamp.now(),
      })
      setSent(true)
      setWaUrlSent(waUrl)
      // Redirect to WhatsApp (works on iOS — same tab navigation)
      if (waUrl) setTimeout(() => { window.location.href = waUrl }, 800)
    } catch(e) { setErr("Error al enviar. Intentá de nuevo.") }
    finally { setSending(false) }
  }

  const OC = {
    bg:"#060411", card:"#110b29", card2:"#19113b", br:"#251b4f",
    v:"#a78bfa", vm:"#c084fc", vbg:"rgba(167,139,250,0.08)",
    tx:"#f8fafc", tx2:"#94a3b8", tx3:"#64748b",
    ok:"#34d399", er:"#f87171",
  }

  if (sent) return (
    <div style={{minHeight:"100vh", background:OC.bg, display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:24, fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=DM+Sans:wght@400;600&display=swap')`}</style>
      <div style={{textAlign:"center", maxWidth:380}}>
        <div style={{fontSize:64, marginBottom:16}}>🎉</div>
        <h2 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:24, fontWeight:700,
          color:OC.v, marginBottom:8}}>¡Pedido enviado!</h2>
        <p style={{color:OC.tx2, fontSize:15, lineHeight:1.7, marginBottom:24}}>
          Tu pedido fue registrado correctamente.<br/>
          El local se va a comunicar con vos pronto.
        </p>
        <div style={{background:OC.card, border:`1px solid ${OC.br}`,
          borderRadius:14, padding:"16px 20px", textAlign:"left"}}>
          <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
            fontWeight:700, color:OC.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:10}}>Resumen</p>
          {cart.map(i=>(
            <div key={i.id} style={{display:"flex", justifyContent:"space-between",
              fontSize:13, color:OC.tx2, padding:"4px 0",
              borderBottom:`1px solid ${OC.br}`}}>
              <span>{i.name} ×{i.qty}</span>
              <span>{$(i.price*i.qty)}</span>
            </div>
          ))}
          <div style={{display:"flex", justifyContent:"space-between",
            marginTop:10, fontFamily:"'Space Grotesk',sans-serif",
            fontSize:16, fontWeight:700, color:OC.v}}>
            <span>Total</span><span>{$(cartTotal)}</span>
          </div>
        </div>

        {waUrlSent && (
          <a href={waUrlSent}
            style={{display:"flex", alignItems:"center", justifyContent:"center",
              gap:8, marginTop:16, textDecoration:"none",
              background:"linear-gradient(135deg,#25d366,#128c7e)",
              borderRadius:12, padding:"14px 0", color:"#fff",
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15,
              boxShadow:"0 4px 16px #25d36644"}}>
            🟢 Enviar pedido por WhatsApp
          </a>
        )}
      </div>
    </div>
  )

  return (
    <div style={{minHeight:"100vh", background:OC.bg,
      fontFamily:"'DM Sans',sans-serif", color:OC.tx,
      backgroundImage:"radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.07) 0%, transparent 60%)"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap')`}</style>

      {/* header */}
      <div style={{background:`${OC.card}ee`, borderBottom:`1px solid ${OC.br}`,
        padding:"12px 16px", display:"flex", alignItems:"center",
        justifyContent:"space-between", position:"sticky", top:0, zIndex:10}}>
        <div>
          <h1 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:17,
            fontWeight:700, color:OC.v, margin:0}}>MAGO Drinks</h1>
          <p style={{fontSize:11, color:OC.tx3, margin:0}}>Catálogo de pedidos</p>
        </div>
        {cartQty > 0 && (
          <div style={{background:`linear-gradient(135deg,${OC.v},${OC.vm})`,
            color:"#0f0a1e", borderRadius:20, padding:"5px 14px",
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:13}}>
            🛒 {cartQty} {cartQty===1?"ítem":"ítems"}
          </div>
        )}
      </div>

      <div style={{maxWidth:600, margin:"0 auto", padding:"16px 12px 120px"}}>
        {loading ? (
          <div style={{textAlign:"center", padding:80, color:OC.tx3}}>Cargando catálogo...</div>
        ) : err && !prods.length ? (
          <div style={{textAlign:"center", padding:60, color:OC.er}}>{err}</div>
        ) : (() => {
          // Group by category
          const groups = {}
          prods.forEach(p => {
            const cat = p.category || "Sin categoría"
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(p)
          })
          const catNames = Object.keys(groups).sort((a,b) => {
            if (a==="Sin categoría") return 1
            if (b==="Sin categoría") return -1
            return a.localeCompare(b)
          })

          const renderCard = p => {
            const inCart = cart.find(i=>i.id===p.id)
            return (
              <div key={p.id} style={{background:OC.card, border:`1px solid ${inCart?OC.v+"66":OC.br}`,
                borderRadius:12, overflow:"hidden",
                boxShadow: inCart?`0 0 16px ${OC.v}22`:"none",
                transition:"border-color .2s, box-shadow .2s"}}>
                <div style={{paddingTop:"75%", position:"relative",
                  overflow:"hidden", background:OC.vbg}}>
                  <img src={p.img||FALLBACK} alt={p.name}
                    style={{position:"absolute", inset:0, width:"100%",
                      height:"100%", objectFit:"cover"}}
                    onError={e=>e.target.src=FALLBACK}/>
                </div>
                <div style={{padding:"8px 10px"}}>
                  <div style={{fontSize:12, fontWeight:600, color:OC.tx,
                    lineHeight:1.3, marginBottom:3}}>{p.name}</div>
                  <div style={{fontFamily:"'DM Mono',monospace", fontSize:13,
                    fontWeight:700, color:OC.v, marginBottom:8}}>{$(p.price)}</div>
                  {!inCart ? (
                    <button onClick={()=>addItem(p)}
                      style={{width:"100%", background:`linear-gradient(135deg,${OC.v},${OC.vm})`,
                        border:"none", borderRadius:7, color:"#0f0a1e",
                        padding:"7px 0", fontFamily:"'Space Grotesk',sans-serif",
                        fontWeight:700, fontSize:12, cursor:"pointer"}}>
                      + Agregar
                    </button>
                  ) : (
                    <div style={{display:"flex", alignItems:"center",
                      justifyContent:"space-between", gap:4}}>
                      <button onClick={()=>setQtyO(p.id,inCart.qty-1)}
                        style={{width:28, height:28, background:OC.card2,
                          border:`1px solid ${OC.br}`, borderRadius:7,
                          color:OC.tx2, fontSize:18, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center"}}>−</button>
                      <span style={{fontFamily:"'DM Mono',monospace",
                        fontSize:14, color:OC.tx, fontWeight:700}}>{inCart.qty}</span>
                      <button onClick={()=>setQtyO(p.id,inCart.qty+1)}
                        style={{width:28, height:28, background:OC.vbg,
                          border:`1px solid ${OC.v}44`, borderRadius:7,
                          color:OC.v, fontSize:18, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center"}}>+</button>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div>
              {catNames.map(cat => (
                <div key={cat} style={{marginBottom:24}}>
                  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
                    <h3 style={{fontFamily:"'Space Grotesk',sans-serif",
                      fontWeight:700, fontSize:15,
                      color: cat==="Sin categoría" ? OC.tx3 : OC.v, margin:0,
                      whiteSpace:"nowrap"}}>{cat}</h3>
                    <div style={{flex:1, height:1, background:OC.br}}/>
                  </div>
                  <div style={{display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10}}>
                    {groups[cat].map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* sticky checkout bar */}
      {cartQty > 0 && (
        <div style={{position:"fixed", bottom:0, left:0, right:0,
          background:OC.card, borderTop:`1px solid ${OC.br}`,
          padding:"14px 16px 20px",
          boxShadow:"0 -8px 32px rgba(0,0,0,.5)"}}>
          <div style={{maxWidth:600, margin:"0 auto"}}>
            <div style={{display:"flex", gap:8, marginBottom:10}}>
              <input type="text" value={name} onChange={e=>setName(e.target.value)}
                placeholder="Tu nombre *"
                style={{flex:1, background:OC.card2, border:`1px solid ${OC.br}`,
                  borderRadius:9, color:OC.tx, padding:"10px 13px", fontSize:14,
                  outline:"none", fontFamily:"'DM Sans',sans-serif"}}
                onFocus={e=>e.target.style.borderColor=OC.v}
                onBlur={e=>e.target.style.borderColor=OC.br}/>
              <input type="text" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Aclaración (opcional)"
                style={{flex:1, background:OC.card2, border:`1px solid ${OC.br}`,
                  borderRadius:9, color:OC.tx, padding:"10px 13px", fontSize:14,
                  outline:"none", fontFamily:"'DM Sans',sans-serif"}}
                onFocus={e=>e.target.style.borderColor=OC.v}
                onBlur={e=>e.target.style.borderColor=OC.br}/>
            </div>
            {err && <p style={{color:OC.er, fontSize:12, marginBottom:8}}>{err}</p>}
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between",
              gap:10}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif"}}>
                <span style={{fontSize:11, color:OC.tx3, letterSpacing:1,
                  textTransform:"uppercase", display:"block"}}>Total</span>
                <span style={{fontSize:22, fontWeight:700, color:OC.v,
                  letterSpacing:-1}}>{$(cartTotal)}</span>
              </div>
              <button onClick={submit} disabled={sending}
                style={{flex:1, maxWidth:220, background:sending?"#444":`linear-gradient(135deg,${OC.v},${OC.vm})`,
                  border:"none", borderRadius:10, color:"#0f0a1e",
                  padding:"13px 0", fontFamily:"'Space Grotesk',sans-serif",
                  fontWeight:700, fontSize:15, cursor:sending?"wait":"pointer",
                  boxShadow:sending?"none":`0 0 20px ${OC.v}44`}}>
                {sending ? "Enviando..." : "Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   ADMIN PANEL
════════════════════════════════════════════════════════════════════════ */
function AdminPanel({user, onLogout, toast}) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [editUser,setEditUser]= useState(null)
  const [filter,  setFilter]  = useState("all")

  const loadUsers = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, "users"))
      const list = snap.docs.map(d => ({id:d.id, ...d.data()}))
      list.sort((a,b) => (b.registered_at?.seconds||0) - (a.registered_at?.seconds||0))
      setUsers(list)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadUsers() }, [])

  const updateUserField = async (uid, data) => {
    try {
      await updateDoc(doc(db, "users", uid), data)
      setUsers(prev => prev.map(u => u.uid===uid ? {...u,...data} : u))
      toast("Usuario actualizado")
    } catch(e) { toast("Error al actualizar", true) }
  }

  const statusCfg = {
    active:    {bg:C.okbg,  c:C.ok,  label:"● Activo"},
    suspended: {bg:C.erbg,  c:C.er,  label:"● Suspendido"},
    pending:   {bg:C.ambg,  c:C.am,  label:"● Pendiente"},
    free:      {bg:C.blbg,  c:C.bl,  label:"● Gratis"},
  }

  const filtered = users.filter(u => {
    const ms = !search
      || u.email?.toLowerCase().includes(search.toLowerCase())
      || u.name?.toLowerCase().includes(search.toLowerCase())
    const mf = filter==="all" || u.status===filter
    return ms && mf
  })

  const stats = {
    total:     users.length,
    active:    users.filter(u => u.status==="active").length,
    suspended: users.filter(u => u.status==="suspended").length,
    pending:   users.filter(u => u.status==="pending").length,
  }

  const LabelStyle = {
    fontFamily:"'Space Grotesk',sans-serif",
    fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase",
  }

  return (
    <div style={{minHeight:"100vh", background:C.bg,
      backgroundImage:`radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.05) 0%, transparent 60%)`}}>

      {/* HEADER */}
      <header style={{background:`${C.card}ee`, borderBottom:`1px solid ${C.br}`,
        padding:"0 20px", display:"flex", alignItems:"center",
        justifyContent:"space-between", height:62, position:"sticky", top:0, zIndex:100,
        boxShadow:C.sh, gap:12}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <img src="/logo.png" alt="MAGO" style={{height:40, objectFit:"contain"}}/>
          <div style={{background:`linear-gradient(135deg,${C.am}22,${C.gold}11)`,
            color:C.am, borderRadius:8, padding:"5px 12px",
            border:`1px solid ${C.am}44`,
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
            fontSize:11, letterSpacing:1.2}}>
            ⭐ SUPER ADMIN
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontSize:12, color:C.tx3, fontFamily:"'DM Mono',monospace"}}>
            {user.email}
          </span>
          <button onClick={onLogout}
            style={{background:C.erbg, border:`1px solid ${C.er}33`, borderRadius:8,
              color:C.er, padding:"6px 14px",
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:600, fontSize:12}}>
            Salir
          </button>
        </div>
      </header>

      <div style={{maxWidth:1000, margin:"0 auto", padding:"28px 16px"}}>

        {/* TITLE */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
            fontSize:26, color:C.tx, marginBottom:4}}>
            Panel de Administración
          </h1>
          <p style={{fontSize:13, color:C.tx3}}>
            Gestión de usuarios y suscripciones — MAGO Drinks POS
          </p>
        </div>

        {/* STAT CARDS */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
          gap:12, marginBottom:28}}>
          {[
            {l:"Total usuarios", v:stats.total,     c:C.v,  bg:C.vbg,  i:"👥"},
            {l:"Activos",        v:stats.active,    c:C.ok, bg:C.okbg, i:"●"},
            {l:"Pago pendiente", v:stats.pending,   c:C.am, bg:C.ambg, i:"●"},
            {l:"Suspendidos",    v:stats.suspended, c:C.er, bg:C.erbg, i:"●"},
          ].map(({l,v,c,bg,i}) => (
            <div key={l} style={{background:C.card, border:`1px solid ${C.br}`,
              borderRadius:14, padding:"18px 20px", boxShadow:C.sh}}>
              <div style={{display:"flex", alignItems:"center", gap:7, marginBottom:12}}>
                <span style={{color:c, fontSize:i==="●"?10:16}}>{i}</span>
                <span style={{...LabelStyle, color:C.tx3}}>{l}</span>
              </div>
              <div style={{fontFamily:"'Space Grotesk',monospace", fontWeight:700,
                fontSize:32, color:c, letterSpacing:-1}}>
                {v}
              </div>
            </div>
          ))}
        </div>

        {/* TOOLBAR */}
        <div style={{display:"flex", gap:10, marginBottom:16,
          flexWrap:"wrap", alignItems:"center"}}>
          <div style={{position:"relative", flex:1, minWidth:220}}>
            <span style={{position:"absolute", left:12, top:"50%",
              transform:"translateY(-50%)", fontSize:14, color:C.tx3,
              pointerEvents:"none"}}>🔍</span>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              style={{width:"100%", background:C.card2, border:`1px solid ${C.br}`,
                borderRadius:10, color:C.tx, padding:"10px 12px 10px 36px",
                fontSize:14, outline:"none", fontFamily:"'DM Sans',sans-serif"}}
              onFocus={e=>{ e.target.style.borderColor=C.v }}
              onBlur={e=>{  e.target.style.borderColor=C.br }}/>
            {search && (
              <button onClick={()=>setSearch("")}
                style={{position:"absolute", right:10, top:"50%",
                  transform:"translateY(-50%)", background:"none", border:"none",
                  color:C.tx3, fontSize:16, padding:4}}>✕</button>
            )}
          </div>
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {[["all","Todos"],["active","Activos"],["pending","Pendientes"],["suspended","Suspendidos"]].map(([k,l]) => (
              <button key={k} onClick={()=>setFilter(k)}
                style={{padding:"8px 14px", borderRadius:9,
                  border:`1px solid ${filter===k ? C.v : C.br}`,
                  background: filter===k ? C.vbg : C.card,
                  color: filter===k ? C.v : C.tx2,
                  fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:12}}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={loadUsers}
            style={{padding:"9px 14px", borderRadius:9,
              border:`1px solid ${C.br}`, background:C.card,
              color:C.tx2, fontFamily:"'DM Sans',sans-serif",
              fontWeight:600, fontSize:12,
              display:"flex", alignItems:"center", gap:6}}>
            🔄 Actualizar
          </button>
        </div>

        {/* USER LIST */}
        {loading ? (
          <div style={{display:"flex", justifyContent:"center", padding:60}}>
            <Spin s={32}/>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:"center", padding:"50px 0", color:C.tx3}}>
            <div style={{fontSize:40, marginBottom:12}}>👥</div>
            <p style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:600,
              fontSize:14, color:C.tx2}}>No se encontraron usuarios</p>
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {filtered.map(u => {
              const st  = statusCfg[u.status] || statusCfg.active
              const adm = isAdminEmail(u.email)
              return (
                <div key={u.id}
                  style={{background:C.card, border:`1px solid ${C.br}`,
                    borderRadius:14, padding:"16px 18px", boxShadow:C.sh,
                    opacity: u.status==="suspended" ? .6 : 1,
                    transition:"opacity .2s"}}>
                  <div style={{display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", flexWrap:"wrap", gap:12}}>

                    {/* avatar + info */}
                    <div style={{display:"flex", alignItems:"center", gap:14,
                      flex:1, minWidth:200}}>
                      <div style={{width:44, height:44,
                        background:`linear-gradient(135deg,${C.v}33,${C.vm}22)`,
                        border:`1px solid ${C.v}44`,
                        borderRadius:12, display:"flex", alignItems:"center",
                        justifyContent:"center", color:C.v,
                        fontFamily:"'Space Grotesk',sans-serif",
                        fontWeight:700, fontSize:18, flexShrink:0}}>
                        {(u.name||u.email||"?")[0].toUpperCase()}
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3}}>
                          <span style={{fontFamily:"'Space Grotesk',sans-serif",
                            fontSize:15, fontWeight:600, color:C.tx}}>
                            {u.name||"Sin nombre"}
                          </span>
                          {adm && (
                            <span style={{background:`linear-gradient(135deg,${C.am}33,${C.gold}22)`,
                              color:C.am, border:`1px solid ${C.am}44`,
                              borderRadius:6, padding:"2px 8px",
                              fontFamily:"'Space Grotesk',sans-serif",
                              fontSize:10, fontWeight:700, letterSpacing:.8}}>
                              ADMIN
                            </span>
                          )}
                          <span style={{...LabelStyle,
                            padding:"3px 9px", borderRadius:20,
                            background:st.bg, color:st.c,
                            border:`1px solid ${st.c}33`}}>
                            {st.label}
                          </span>
                        </div>
                        <p style={{fontSize:12, color:C.tx2, fontFamily:"'DM Mono',monospace"}}>
                          {u.email}
                        </p>
                        <p style={{fontSize:11, color:C.tx3, marginTop:3}}>
                          Registrado: {fmtDate(u.registered_at)} · Acceso: {fmtDate(u.last_login)}
                        </p>
                        {u.notes && (
                          <p style={{fontSize:12, color:C.am, marginTop:5,
                            background:C.ambg, borderRadius:6, padding:"3px 10px",
                            display:"inline-block", border:`1px solid ${C.am}33`}}>
                            📝 {u.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* actions */}
                    {!adm && (
                      <div style={{display:"flex", gap:6, flexWrap:"wrap", flexShrink:0}}>
                        {u.status !== "active" && (
                          <button onClick={()=>updateUserField(u.uid,{status:"active"})}
                            style={{padding:"7px 12px", borderRadius:8,
                              border:`1px solid ${C.ok}44`, background:C.okbg,
                              color:C.ok, fontFamily:"'DM Sans',sans-serif",
                              fontWeight:600, fontSize:12}}>✅ Activar</button>
                        )}
                        {u.status !== "pending" && (
                          <button onClick={()=>updateUserField(u.uid,{status:"pending"})}
                            style={{padding:"7px 12px", borderRadius:8,
                              border:`1px solid ${C.am}44`, background:C.ambg,
                              color:C.am, fontFamily:"'DM Sans',sans-serif",
                              fontWeight:600, fontSize:12}}>⏳ Pendiente</button>
                        )}
                        {u.status !== "suspended" && (
                          <button onClick={()=>updateUserField(u.uid,{status:"suspended"})}
                            style={{padding:"7px 12px", borderRadius:8,
                              border:`1px solid ${C.er}44`, background:C.erbg,
                              color:C.er, fontFamily:"'DM Sans',sans-serif",
                              fontWeight:600, fontSize:12}}>🚫 Suspender</button>
                        )}
                        <button onClick={()=>setEditUser(u)}
                          style={{padding:"7px 12px", borderRadius:8,
                            border:`1px solid ${C.br}`, background:C.card2,
                            color:C.tx2, fontFamily:"'DM Sans',sans-serif",
                            fontWeight:600, fontSize:12}}>✏️ Nota</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editUser && (
        <NoteModal user={editUser} onClose={()=>setEditUser(null)}
          onSave={notes => { updateUserField(editUser.uid, {notes}); setEditUser(null) }}/>
      )}
    </div>
  )
}

function NoteModal({user, onClose, onSave}) {
  const [notes, setNotes] = useState(user.notes||"")
  return (
    <div style={{position:"fixed", inset:0, zIndex:900,
      background:"rgba(6,4,17,.8)", display:"flex",
      alignItems:"center", justifyContent:"center", padding:20}} onClick={onClose}>
      <div className="fadeUp"
        style={{background:C.card, borderRadius:18, padding:26,
          maxWidth:380, width:"100%", boxShadow:C.shM,
          border:`1px solid ${C.br}`}}
        onClick={e => e.stopPropagation()}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
          fontSize:17, color:C.tx, marginBottom:4}}>📝 Nota interna</h3>
        <p style={{fontSize:12, color:C.tx3, marginBottom:16,
          fontFamily:"'DM Mono',monospace"}}>
          {user.name} · {user.email}
        </p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)}
          placeholder="Ej: Pagó hasta marzo, debe abril..."
          rows={4} style={{width:"100%", background:C.card2,
            border:`1px solid ${C.br}`, borderRadius:10, color:C.tx,
            padding:"12px 14px", fontSize:14, outline:"none",
            fontFamily:"'DM Sans',sans-serif", resize:"vertical"}}
          onFocus={e=>e.target.style.borderColor=C.v}
          onBlur={e=>e.target.style.borderColor=C.br}/>
        <div style={{display:"flex", gap:10, marginTop:14}}>
          <button onClick={onClose}
            style={{flex:1, padding:"11px 0", background:C.card2,
              border:`1px solid ${C.br}`, borderRadius:10, color:C.tx2,
              fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:15}}>
            Cancelar
          </button>
          <button onClick={()=>onSave(notes)}
            style={{flex:1, padding:"11px 0", border:"none",
              borderRadius:10, color:"#0f0a1e",
              background:`linear-gradient(135deg,${C.v},${C.vm})`,
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15,
              boxShadow:`0 0 20px ${C.v}44`}}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   STATUS SCREENS
════════════════════════════════════════════════════════════════════════ */
function StatusScreen({icon, title, body, note, btnLabel, btnColor, onLogout}) {
  return (
    <div style={{minHeight:"100vh", background:C.bg, display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:24,
      backgroundImage:`radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.05) 0%, transparent 60%)`}}>
      <img src="/logo.png" style={{height:60, objectFit:"contain", marginBottom:32}}/>
      <div style={{background:C.card, borderRadius:22, padding:"32px 28px",
        maxWidth:380, width:"100%", textAlign:"center",
        boxShadow:C.shM, border:`1px solid ${C.br}`}}>
        <div style={{width:64, height:64,
          background:`${btnColor}11`, border:`1px solid ${btnColor}33`,
          borderRadius:18, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:28, margin:"0 auto 18px"}}>
          {icon}
        </div>
        <h2 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:20,
          fontWeight:700, color:C.tx, marginBottom:10}}>{title}</h2>
        <p style={{fontSize:14, color:C.tx2, lineHeight:1.7, marginBottom:6}}>{body}</p>
        <p style={{fontSize:13, color:C.tx3, lineHeight:1.7, marginBottom:26}}>{note}</p>
        <button onClick={onLogout}
          style={{width:"100%", background:`${btnColor}11`,
            border:`1px solid ${btnColor}33`, borderRadius:12,
            padding:"13px 0", color:btnColor,
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15}}>
          {btnLabel}
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   PRODUCT MODAL
════════════════════════════════════════════════════════════════════════ */
function ProductModal({p, categories=[], onClose, onSave}) {
  const edit = !!p?.id
  const [name,    setName]    = useState(p?.name  || "")
  const [price,   setPrice]   = useState(p?.price || "")
  const [url,     setUrl]     = useState(p?.img   || "")
  const [preview, setPreview] = useState(p?.img   || "")
  const [category,setCategory]= useState(p?.category || "")
  const [newCat,  setNewCat]  = useState("")
  const [addingCat,setAddingCat]= useState(false)
  const [stock,   setStock]   = useState(p?.stock ?? "")
  const [stockMin,setStockMin]= useState(p?.stock_min ?? "")
  const [unit,    setUnit]    = useState(p?.unit || "unidad")
  const [b64,     setB64]     = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState("")
  const fRef    = useRef()
  const blobRef = useRef(null)

  const pickFile = async e => {
    const f = e.target.files[0]; if (!f) return
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    const objectUrl = URL.createObjectURL(f)
    blobRef.current = objectUrl
    setPreview(objectUrl); setUrl(""); setB64(null); setBusy(true)
    const result = await compress(f)
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    setB64(result); setBusy(false)
  }

  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }, [])

  const save = () => {
    if (!name.trim()) return setErr("Nombre requerido")
    const pr = parseFloat(price)
    if (!pr || pr <= 0) return setErr("Precio inválido")
    if (busy) return setErr("Esperá la foto...")
    const finalCat = (addingCat ? newCat.trim() : category.trim())
    onSave({
      id:p?.id, name:name.trim(), price:pr,
      img:b64||url.trim()||FALLBACK, category:finalCat,
      stock: stock==="" ? null : parseFloat(stock)||0,
      stock_min: stockMin==="" ? 0 : parseFloat(stockMin)||0,
      unit: unit||"unidad",
    })
  }

  const I = {
    width:"100%", background:C.card2, border:`1px solid ${C.br}`,
    borderRadius:10, color:C.tx, padding:"12px 14px", fontSize:15,
    outline:"none", fontFamily:"'DM Sans',sans-serif", display:"block",
    transition:"border-color .2s",
  }
  const focusIn  = e => e.target.style.borderColor = C.v
  const focusOut = e => e.target.style.borderColor = C.br

  return (
    <div style={{position:"fixed", inset:0, zIndex:800,
      background:"rgba(6,4,17,.85)",
      display:"flex", alignItems:"flex-end", justifyContent:"center"}}
      onClick={onClose}>
      <div className="fadeUp"
        style={{background:C.card, borderRadius:"20px 20px 0 0",
          padding:"22px 20px 32px", width:"100%", maxWidth:500,
          maxHeight:"92vh", overflowY:"auto", position:"relative",
          border:`1px solid ${C.br}`, borderBottom:"none",
          boxShadow:`0 -12px 48px rgba(0,0,0,.7)`}}
        onClick={e => e.stopPropagation()}>

        <div style={{width:36, height:4, background:C.br, borderRadius:4,
          margin:"-6px auto 18px"}}/>
        <button onClick={onClose}
          style={{position:"absolute", top:18, right:18, background:C.vbg,
            border:`1px solid ${C.br}`, color:C.v, width:32, height:32,
            borderRadius:9, fontSize:16, display:"flex",
            alignItems:"center", justifyContent:"center", fontWeight:700}}>✕</button>

        <h2 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:19,
          fontWeight:700, color:C.tx, marginBottom:20}}>
          {edit ? "✏️ Editar producto" : "➕ Nuevo producto"}
        </h2>

        {/* nombre */}
        <div style={{marginBottom:14}}>
          <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
            fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:6}}>Nombre *</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)}
            placeholder="Ej: Vodka Skyy 750ml" style={I}
            onFocus={focusIn} onBlur={focusOut}/>
        </div>

        {/* precio */}
        <div style={{marginBottom:18}}>
          <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
            fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:6}}>Precio *</label>
          <input type="number" value={price} onChange={e=>setPrice(e.target.value)}
            placeholder="Ej: 8500" min={0} style={I}
            onFocus={focusIn} onBlur={focusOut}/>
        </div>

        {/* categoría */}
        <div style={{marginBottom:18}}>
          <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
            fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:6}}>Categoría</label>

          {!addingCat ? (
            <div style={{display:"flex", gap:8}}>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                style={{...I, flex:1, cursor:"pointer", appearance:"none",
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a78bfa' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center",
                  paddingRight:36}}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={()=>{setAddingCat(true);setNewCat("")}}
                style={{padding:"0 16px", background:C.vbg,
                  border:`1px solid ${C.v}44`, borderRadius:10, color:C.v,
                  fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                  fontSize:18, flexShrink:0}}>+</button>
            </div>
          ) : (
            <div style={{display:"flex", gap:8}}>
              <input type="text" value={newCat} onChange={e=>setNewCat(e.target.value)}
                placeholder="Nueva categoría..." style={{...I, flex:1}}
                onFocus={focusIn} onBlur={focusOut} autoFocus/>
              <button onClick={()=>{setAddingCat(false);setNewCat("")}}
                style={{padding:"0 16px", background:C.card2,
                  border:`1px solid ${C.br}`, borderRadius:10, color:C.tx3,
                  fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                  fontSize:16, flexShrink:0}}>✕</button>
            </div>
          )}
        </div>

        {/* stock */}
        <div style={{marginBottom:18, background:C.card2, borderRadius:12,
          padding:"14px 14px 16px", border:`1px solid ${C.br}`}}>
          <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
            fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:12}}>📦 Inventario (opcional)</label>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
            <div>
              <label style={{display:"block", fontSize:10, fontWeight:600,
                color:C.tx3, marginBottom:5}}>Stock actual</label>
              <input type="text" inputMode="numeric" value={stock}
                onChange={e=>setStock(e.target.value.replace(/[^0-9]/g,""))}
                placeholder="Ej: 24"
                style={{...I, background:C.card, fontSize:14, padding:"10px 12px"}}
                onFocus={focusIn} onBlur={focusOut}/>
            </div>
            <div>
              <label style={{display:"block", fontSize:10, fontWeight:600,
                color:C.tx3, marginBottom:5}}>Stock mínimo</label>
              <input type="text" inputMode="numeric" value={stockMin}
                onChange={e=>setStockMin(e.target.value.replace(/[^0-9]/g,""))}
                placeholder="Ej: 5"
                style={{...I, background:C.card, fontSize:14, padding:"10px 12px"}}
                onFocus={focusIn} onBlur={focusOut}/>
            </div>
          </div>
          <div>
            <label style={{display:"block", fontSize:10, fontWeight:600,
              color:C.tx3, marginBottom:5}}>Unidad</label>
            <select value={unit} onChange={e=>setUnit(e.target.value)}
              style={{...I, background:C.card, fontSize:14, padding:"10px 12px",
                cursor:"pointer", appearance:"none",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a78bfa' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center",
                paddingRight:36}}>
              <option value="unidad">Unidad</option>
              <option value="caja">Caja</option>
              <option value="paquete">Paquete</option>
              <option value="botella">Botella</option>
              <option value="pack">Pack</option>
              <option value="litro">Litro</option>
              <option value="kg">Kilo</option>
            </select>
          </div>
          <p style={{fontSize:11, color:C.tx3, marginTop:10, lineHeight:1.5}}>
            Dejá el stock vacío si este producto no maneja inventario.
          </p>
        </div>

        {/* foto */}
        <div style={{marginBottom:20}}>
          <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
            fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
            textTransform:"uppercase", marginBottom:10}}>Foto</label>

          {preview && (
            <div style={{position:"relative", marginBottom:12}}>
              <img src={preview} style={{width:"100%", height:130, objectFit:"cover",
                borderRadius:12, border:`1px solid ${C.br}`, display:"block"}}
                onError={e => e.target.style.display="none"}/>
              <button onClick={() => { setPreview(""); setB64(null); setUrl("") }}
                style={{position:"absolute", top:8, right:8,
                  background:"rgba(6,4,17,.8)", border:`1px solid ${C.br}`,
                  borderRadius:8, color:C.er, width:28, height:28,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:14}}>✕</button>
            </div>
          )}

          <button onClick={() => fRef.current.click()}
            style={{width:"100%", padding:"12px", background:C.vbg,
              border:`1px dashed ${C.v}55`, borderRadius:12, color:C.v,
              fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:14,
              display:"flex", alignItems:"center", justifyContent:"center",
              gap:8, marginBottom:10}}>
            {busy ? <><Spin s={16}/> Procesando...</> : "📷 Subir foto"}
          </button>
          <input ref={fRef} type="file" accept="image/*"
            onChange={pickFile} style={{display:"none"}}/>

          <input type="text" value={url}
            onChange={e => { setUrl(e.target.value); setB64(null); setPreview(e.target.value) }}
            placeholder="o pegá una URL..." style={{...I, fontSize:13}}
            onFocus={focusIn} onBlur={focusOut}/>
        </div>

        {err && (
          <div style={{background:C.erbg, border:`1px solid ${C.er}44`,
            borderRadius:10, padding:"10px 14px",
            color:C.er, fontSize:13, marginBottom:14}}>⚠️ {err}</div>
        )}

        <button onClick={save} disabled={busy}
          style={{width:"100%", border:"none", borderRadius:12, padding:"14px 0",
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:16,
            color: busy ? C.tx3 : "#0f0a1e",
            background: busy ? C.card2 : `linear-gradient(135deg,${C.v},${C.vm})`,
            boxShadow: busy ? "none" : `0 0 24px ${C.v}44`,
            display:"flex", alignItems:"center", justifyContent:"center", gap:10}}>
          {edit ? "Guardar cambios" : "Agregar producto"}
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   PAY MODAL
════════════════════════════════════════════════════════════════════════ */
function PayModal({total, onClose, onPay}) {
  const [mode, setMode]       = useState("efectivo")
  const [cash, setCash]       = useState("")
  const [mp,   setMp]         = useState("")
  const c = parseFloat(cash)||0, m = parseFloat(mp)||0
  const change = mode==="efectivo" ? Math.max(0,c-total)
               : mode==="mixto"    ? Math.max(0,c-(total-m)) : 0
  const ok = mode==="efectivo"     ? c>=total
           : mode==="transferencia"? true : (m+c)>=total

  const N = {
    width:"100%", background:C.card2, border:`1px solid ${C.br}`,
    borderRadius:10, color:C.tx, padding:"13px 15px", fontSize:24,
    outline:"none", fontFamily:"'Space Grotesk',monospace",
    display:"block", letterSpacing:.5, transition:"border-color .2s",
  }

  return (
    <div style={{position:"fixed", inset:0, zIndex:800,
      background:"rgba(6,4,17,.85)",
      display:"flex", alignItems:"flex-end", justifyContent:"center"}}
      onClick={onClose}>
      <div className="fadeUp"
        style={{background:C.card, borderRadius:"20px 20px 0 0",
          padding:"22px 20px 32px", width:"100%", maxWidth:500,
          maxHeight:"92vh", overflowY:"auto", position:"relative",
          border:`1px solid ${C.br}`, borderBottom:"none",
          boxShadow:`0 -12px 48px rgba(0,0,0,.7)`}}
        onClick={e => e.stopPropagation()}>

        <div style={{width:36, height:4, background:C.br, borderRadius:4,
          margin:"-6px auto 18px"}}/>
        <button onClick={onClose}
          style={{position:"absolute", top:18, right:18, background:C.vbg,
            border:`1px solid ${C.br}`, color:C.v, width:32, height:32,
            borderRadius:9, fontSize:16, display:"flex",
            alignItems:"center", justifyContent:"center", fontWeight:700}}>✕</button>

        <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
          fontWeight:600, color:C.tx3, letterSpacing:1.2, marginBottom:4,
          textTransform:"uppercase"}}>Cobrar venta</p>
        <p style={{fontFamily:"'Space Grotesk',monospace", fontSize:36,
          fontWeight:700, color:C.tx, marginBottom:22, letterSpacing:-1}}>
          {$(total)}
        </p>

        {/* method selector */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
          gap:8, marginBottom:22}}>
          {[
            {k:"efectivo",      i:"💵", l:"Efectivo"},
            {k:"transferencia", i:"📲", l:"Transfer"},
            {k:"mixto",         i:"🔀", l:"Mixto"},
          ].map(({k,i,l}) => (
            <button key={k} onClick={() => setMode(k)}
              style={{padding:"13px 4px", borderRadius:12,
                background: mode===k ? C.vbg : C.card2,
                color:       mode===k ? C.v   : C.tx2,
                border: `1px solid ${mode===k ? C.v : C.br}`,
                fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:13,
                boxShadow: mode===k ? `0 0 16px ${C.v}33` : "none"}}>
              <div style={{fontSize:20, marginBottom:3}}>{i}</div>
              {l}
            </button>
          ))}
        </div>

        {(mode==="efectivo"||mode==="mixto") && (
          <div style={{marginBottom:14}}>
            <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
              fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
              textTransform:"uppercase", marginBottom:8}}>
              {mode==="mixto" ? "💵 Monto efectivo" : "Monto recibido"}
            </label>
            <input type="number" value={cash} onChange={e=>setCash(e.target.value)}
              placeholder="0" style={N} autoFocus
              onFocus={e=>e.target.style.borderColor=C.ok}
              onBlur={e=>e.target.style.borderColor=C.br}/>
          </div>
        )}

        {(mode==="transferencia"||mode==="mixto") && (
          <div style={{marginBottom:14}}>
            <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
              fontSize:11, fontWeight:600, color:C.tx3, letterSpacing:1,
              textTransform:"uppercase", marginBottom:8}}>
              📲 Monto MP / Transfer
            </label>
            {mode==="transferencia"
              ? <div style={{padding:"13px 15px", background:C.blbg,
                    border:`1px solid ${C.bl}44`, borderRadius:10,
                    fontFamily:"'Space Grotesk',monospace",
                    color:C.bl, fontSize:24, letterSpacing:.5}}>{$(total)}</div>
              : <input type="number" value={mp} onChange={e=>setMp(e.target.value)}
                    placeholder="0" style={N}
                    onFocus={e=>e.target.style.borderColor=C.bl}
                    onBlur={e=>e.target.style.borderColor=C.br}/>
            }
          </div>
        )}

        {mode==="mixto" && m>0 && (
          <div style={{background:C.vbg, borderRadius:12,
            border:`1px solid ${C.v}33`, padding:"12px 16px", marginBottom:14}}>
            <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
              fontWeight:600, color:C.tx3, letterSpacing:1,
              textTransform:"uppercase", marginBottom:4}}>Efectivo requerido</p>
            <p style={{fontFamily:"'Space Grotesk',monospace",
              fontSize:24, color:C.v, fontWeight:700, letterSpacing:-1}}>
              {$(Math.max(0, total-m))}
            </p>
          </div>
        )}

        {(mode==="efectivo"||mode==="mixto") && c>0 && (
          <div style={{background: change>0 ? C.okbg : C.erbg,
            border:`1px solid ${change>0 ? C.ok : C.er}44`,
            borderRadius:12, padding:"12px 16px", marginBottom:18}}>
            <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
              fontWeight:600, color:C.tx3, letterSpacing:1,
              textTransform:"uppercase", marginBottom:4}}>Vuelto</p>
            <p style={{fontFamily:"'Space Grotesk',monospace", fontSize:34,
              fontWeight:700, letterSpacing:-1,
              color: change>0 ? C.ok : C.er}}>{$(change)}</p>
            {change < 0 && (
              <p style={{fontSize:12, color:C.er, marginTop:4,
                fontFamily:"'DM Sans',sans-serif", fontWeight:600}}>
                ⚠️ Monto insuficiente
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => ok && onPay({mode, cashPaid:c, mpPaid:mode==="transferencia"?total:m, change})}
          disabled={!ok}
          style={{width:"100%", border:"none", borderRadius:12, padding:"15px 0",
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:17,
            color: ok ? "#0f0a1e" : C.tx3,
            background: ok ? `linear-gradient(135deg,${C.v},${C.vm})` : C.card2,
            boxShadow: ok ? `0 0 24px ${C.v}44` : "none",
            cursor: ok ? "pointer" : "not-allowed"}}>
          Confirmar venta
        </button>
      </div>
    </div>
  )
}

/* ─── DELETE CONFIRM ─────────────────────────────────────────────────── */
function Del({name, onYes, onNo}) {
  return (
    <div style={{position:"fixed", inset:0, zIndex:900,
      background:"rgba(6,4,17,.85)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20}}>
      <div className="fadeUp"
        style={{background:C.card, borderRadius:20, padding:28,
          maxWidth:320, width:"100%", textAlign:"center",
          boxShadow:C.shM, border:`1px solid ${C.br}`}}>
        <div style={{width:56, height:56, background:C.erbg,
          border:`1px solid ${C.er}33`,
          borderRadius:16, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:26, margin:"0 auto 14px"}}>🗑️</div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",
          fontSize:17, fontWeight:700, color:C.tx, marginBottom:8}}>
          Eliminar producto
        </h3>
        <p style={{color:C.tx2, fontSize:14, marginBottom:22, lineHeight:1.6}}>
          ¿Eliminar <b style={{color:C.tx}}>"{name}"</b>?
        </p>
        <div style={{display:"flex", gap:10}}>
          <button onClick={onNo}
            style={{flex:1, padding:"12px 0", background:C.card2,
              border:`1px solid ${C.br}`, borderRadius:10, color:C.tx2,
              fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:15}}>
            Cancelar
          </button>
          <button onClick={onYes}
            style={{flex:1, padding:"12px 0", border:`1px solid ${C.er}44`,
              background:C.erbg, borderRadius:10, color:C.er,
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15}}>
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
export default function App() {
  const {show:toast, el:toastEl} = useToast()
  const [user,       setUser]       = useState(undefined)
  const [userStatus, setUserStatus] = useState(null)
  // ── URL-based routing — detect ?order=uid for public order page ──────
  const orderUID = new URLSearchParams(window.location.search).get("order")

  const [tab,        setTab]        = useState("caja")
  const [prods,      setProds]      = useState([])
  const [mayorProds, setMayorProds] = useState([])
  const [lista,      setLista]      = useState("minorista") // "minorista" | "mayorista"
  const [cart,       setCart]       = useState([])
  const [sales,      setSales]      = useState([])
  const [histFrom,   setHistFrom]   = useState(startOfDayDT)
  const [histTo,     setHistTo]     = useState(nowLocalDT)
  const [vendFrom,   setVendFrom]   = useState(startOfDayDT)
  const [vendTo,     setVendTo]     = useState(nowLocalDT)
  const [loadP,      setLoadP]      = useState(false)
  const [loadS,      setLoadS]      = useState(false)
  const [vendSales,  setVendSales]  = useState([])
  const [loadV,      setLoadV]      = useState(false)
  const [orders,     setOrders]     = useState([])
  const [loadOrders, setLoadOrders] = useState(false)
  const [orderToPay, setOrderToPay] = useState(null)
  const [waNumber,   setWaNumber]   = useState("")
  const [waSaving,   setWaSaving]   = useState(false)
  const [activeShift,setActiveShift]= useState(null)   // {id, opened_at}
  const [shiftBusy,  setShiftBusy]  = useState(false)
  const [prodModal,  setProdModal]  = useState(null)
  const [payModal,   setPayModal]   = useState(false)
  const [delModal,   setDelModal]   = useState(null)
  const [mobile,     setMobile]     = useState(window.innerWidth < 768)
  const [mView,      setMView]      = useState("prods")
  const [search,     setSearch]     = useState("")

  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { setUser(null); setUserStatus(null); return }
      setUser(u)
      try {
        const snap = await getDoc(doc(db, "users", u.uid))
        if (snap.exists()) {
          setUserStatus(snap.data().status || "active")
          setWaNumber(snap.data().wa_number || "")
          updateDoc(doc(db,"users",u.uid), {last_login:Timestamp.now()}).catch(()=>{})
        } else {
          await setDoc(doc(db,"users",u.uid), {
            uid:u.uid, email:u.email?.toLowerCase()||"",
            name:u.displayName||"", status:"active", plan:"free",
            registered_at:Timestamp.now(), last_login:Timestamp.now(), notes:"",
          })
          setUserStatus("active")
        }
      } catch(e) { setUserStatus("active") }
    })
  }, [])

  const isAdmin      = isAdminEmail(user?.email)
  const prodsCol     = user ? collection(db, `users/${user.uid}/products`)          : null
  const mayorCol     = user ? collection(db, `users/${user.uid}/products_mayorista`) : null
  const salesCol     = user ? collection(db, `users/${user.uid}/sales`)              : null
  const activeCol    = lista === "mayorista" ? mayorCol : prodsCol
  const activeProds  = lista === "mayorista" ? mayorProds : prods
  const setActiveProds = lista === "mayorista" ? setMayorProds : setProds

  const handleLogout = async () => {
    await signOut(auth)
    setProds([]); setCart([]); setSales([])
    setActiveShift(null)
  }

  useEffect(() => {
    if (!user || isAdmin) return
    setLoadP(true)
    const sort = list => list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0))
    Promise.all([
      getDocs(prodsCol).then(s => sort(s.docs.map(d=>({id:d.id,...d.data()})))),
      getDocs(mayorCol).then(s => sort(s.docs.map(d=>({id:d.id,...d.data()})))),
    ]).then(([retail, mayor]) => {
      setProds(retail)
      setMayorProds(mayor)
    }).catch(console.warn).finally(() => setLoadP(false))
  }, [user])

  // Shared query by Timestamp range
  const queryByRange = async (col, from, to) => {
    const tsFrom = Timestamp.fromDate(new Date(from))
    const tsTo   = Timestamp.fromDate(new Date(to))
    const snap   = await getDocs(query(col,
      where("created_at",">=",tsFrom),
      where("created_at","<=",tsTo)
    ))
    return snap.docs.map(d => ({id:d.id, ...d.data()}))
  }

  useEffect(() => {
    if (!user || !salesCol || tab!=="hist" || isAdmin) return
    setLoadS(true)
    queryByRange(salesCol, histFrom, histTo)
      .then(list => {
        list.sort((a,b) => (b.created_at?.seconds||0) - (a.created_at?.seconds||0))
        setSales(list)
      }).catch(console.warn).finally(() => setLoadS(false))
  }, [user, tab, histFrom, histTo])

  useEffect(() => {
    if (!user || !salesCol || tab!=="vendidos" || isAdmin) return
    setLoadV(true)
    queryByRange(salesCol, vendFrom, vendTo)
      .then(list => setVendSales(list))
      .catch(console.warn).finally(() => setLoadV(false))
  }, [user, tab, vendFrom, vendTo])

  // Load pending orders — real-time listener
  useEffect(() => {
    if (!user || isAdmin) return
    const ordersCol = collection(db, `users/${user.uid}/orders`)
    const unsub = onSnapshot(
      query(ordersCol, where("status","==","pending")),
      snap => setOrders(snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0))),
      err => console.warn("orders snap:", err)
    )
    return () => unsub()
  }, [user])

  // Load active shift on login
  useEffect(() => {
    if (!user || isAdmin) return
    const shiftsCol = collection(db, `users/${user.uid}/shifts`)
    getDocs(query(shiftsCol, where("status","==","open")))
      .then(snap => {
        if (!snap.empty) {
          const d = snap.docs[0]
          setActiveShift({id:d.id, ...d.data()})
        }
      }).catch(console.warn)
  }, [user])

  /* cart */
  const [delSaleModal, setDelSaleModal] = useState(null)
  const [discount,     setDiscount]     = useState("")

  const cartTotal   = cart.reduce((s,i) => s + i.price*i.qty, 0)
  const discountAmt = Math.min(Math.max(parseFloat(discount)||0, 0), cartTotal)
  const cartFinal   = cartTotal - discountAmt
  const cartQty     = cart.reduce((s,i) => s + i.qty, 0)

  const filteredProds = activeProds.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const addItem = p => {
    setCart(prev => {
      const ex = prev.find(i => i.id===p.id)
      return ex ? prev.map(i => i.id===p.id ? {...i,qty:i.qty+1} : i) : [...prev,{...p,qty:1}]
    })
    toast(`${p.name} agregado`)
  }

  const setQty = (id,q) => setCart(prev =>
    q<=0 ? prev.filter(i=>i.id!==id) : prev.map(i=>i.id===id ? {...i,qty:q} : i)
  )

  /* save product — optimistic + real-time listener updates UI automatically */
  const saveProd = p => {
    if (!user || !activeCol) return
    const img      = p.img || FALLBACK
    const category = p.category || ""
    const stockData = {
      stock:     p.stock ?? null,
      stock_min: p.stock_min ?? 0,
      unit:      p.unit || "unidad",
    }
    const colPath = lista === "mayorista"
      ? `users/${user.uid}/products_mayorista`
      : `users/${user.uid}/products`

    if (p.id) {
      setActiveProds(prev => prev.map(x => x.id===p.id ? {...x,...p,img,category,...stockData} : x))
      setProdModal(null); toast(`"${p.name}" actualizado`)
      updateDoc(doc(db, colPath, p.id), {name:p.name, price:p.price, img, category, ...stockData}).catch(console.warn)
    } else {
      const tmp = uid()
      setActiveProds(prev => [...prev, {id:tmp, name:p.name, price:p.price, img, category, ...stockData, created_at:{seconds:Date.now()/1000}}])
      setProdModal(null); toast(`"${p.name}" agregado`)
      addDoc(activeCol, {name:p.name, price:p.price, img, category, ...stockData, created_at:Timestamp.now()})
        .then(r => setActiveProds(prev => prev.map(x => x.id===tmp ? {...x,id:r.id} : x)))
        .catch(console.warn)
    }
  }

  /* delete — optimistic */
  const delProd = id => {
    if (!user) return
    setActiveProds(prev => prev.filter(p => p.id!==id))
    setCart(prev  => prev.filter(i => i.id!==id))
    setDelModal(null); toast("Producto eliminado")
    const colPath = lista === "mayorista"
      ? `users/${user.uid}/products_mayorista`
      : `users/${user.uid}/products`
    if (!id.startsWith("_")) deleteDoc(doc(db, colPath, id)).catch(console.warn)
  }

  // ── STOCK: descuenta (sign=-1) o devuelve (sign=+1) según items vendidos ──
  const applyStockChange = (items, listaVenta, sign) => {
    if (!user) return
    // Solo la lista minorista/mayorista correspondiente maneja su stock
    const colPath = listaVenta === "mayorista"
      ? `users/${user.uid}/products_mayorista`
      : `users/${user.uid}/products`
    const setter  = listaVenta === "mayorista" ? setMayorProds : setProds
    const current = listaVenta === "mayorista" ? mayorProds : prods

    items.forEach(it => {
      // Buscar el producto por nombre (los items guardan product_name)
      const prod = current.find(p => p.name === it.product_name)
      if (!prod || prod.stock === null || prod.stock === undefined) return
      const newStock = (prod.stock || 0) + sign * it.qty
      // Optimistic UI
      setter(prev => prev.map(p => p.id===prod.id ? {...p, stock:newStock} : p))
      // Firebase
      if (!String(prod.id).startsWith("_"))
        updateDoc(doc(db, colPath, prod.id), {stock:newStock}).catch(console.warn)
    })
  }

  const delSale = id => {
    if (!user) return
    // Devolver stock antes de eliminar
    const saleToDel = sales.find(s => s.id===id)
    if (saleToDel) applyStockChange(saleToDel.items||[], saleToDel.lista||"minorista", +1)
    setSales(prev => prev.filter(s => s.id!==id))
    setDelSaleModal(null); toast("Venta eliminada — stock devuelto")
    if (!id.startsWith("_")) deleteDoc(doc(db,`users/${user.uid}/sales`,id)).catch(console.warn)
  }

  /* pay — optimistic */
  const paySale = info => {
    if (!user || !salesCol) return
    const td = today()
    const sale = {
      id:uid(), date:td, total:cartFinal,
      discount: discountAmt,
      lista: lista,
      method:info.mode, cash_paid:info.cashPaid||0,
      mp_paid:info.mpPaid||0, change_amount:info.change||0,
      items:cart.map(i => ({product_name:i.name, product_price:i.price, qty:i.qty})),
      created_at:{seconds:Date.now()/1000, toDate:()=>new Date()},
    }
    // Descontar stock de los productos vendidos
    applyStockChange(sale.items, lista, -1)
    // Optimistic: si la venta es de hoy, extendemos el rango hasta ahora
    // para que aparezca al instante en el historial
    const saleTs = sale.created_at.seconds * 1000
    const fromMs = new Date(histFrom).getTime()
    const toMs   = new Date(histTo).getTime()
    if (saleTs >= fromMs && saleTs <= toMs) {
      setSales(prev => [sale,...prev])
    } else if (saleTs > toMs) {
      setHistTo(nowLocalDT())
      if (saleTs >= fromMs) setSales(prev => [sale,...prev])
    }
    setCart([]); setPayModal(false); setDiscount("")
    toast("✓ Venta registrada")
    if (mobile) setMView("prods")
    const {id:_, created_at:_c, ...fb} = sale
    addDoc(salesCol, {...fb, created_at:Timestamp.now()})
      .then(r => setSales(prev => prev.map(s => s.id===sale.id ? {...s,id:r.id} : s)))
      .catch(console.warn)
  }

  /* stats */
  const st = {
    total: sales.reduce((s,v) => s+v.total, 0),
    ef:    sales.reduce((s,v) => s+(v.cash_paid||0), 0),
    mp:    sales.reduce((s,v) => s+(v.mp_paid||0), 0),
    items: sales.reduce((s,v) => s+(v.items||[]).reduce((a,i)=>a+i.qty,0), 0),
    count: sales.length,
    mayor: sales.filter(v=>v.lista==="mayorista").reduce((s,v)=>s+v.total,0),
  }
  const confirmOrder = async (order, payInfo) => {
    if (!user || !salesCol) return
    const td = today()
    // Create sale from order
    const sale = {
      id:"_o"+order.id,
      date:td, total:order.total,
      lista: order.lista||"minorista",
      method:payInfo.mode, cash_paid:payInfo.cashPaid||0,
      mp_paid:payInfo.mpPaid||0, change_amount:payInfo.change||0,
      items:order.items,
      customer_name:order.customer_name,
      created_at:{seconds:Date.now()/1000,toDate:()=>new Date()},
    }
    // Descontar stock del pedido cobrado
    applyStockChange(order.items||[], order.lista||"minorista", -1)
    // Optimistic — extendemos el rango si hace falta para verlo al instante
    const nowDT = nowLocalDT()
    if (histFrom <= nowDT && nowDT <= histTo) {
      setSales(prev=>[sale,...prev])
    } else if (nowDT > histTo) {
      setHistTo(nowDT)
      if (histFrom <= nowDT) setSales(prev=>[sale,...prev])
    }
    setOrderToPay(null)
    toast("✓ Pedido cobrado")
    // Save to Firebase — replace temp id with real one
    const {id:_,created_at:_c,...fb}=sale
    addDoc(salesCol,{...fb,created_at:Timestamp.now()})
      .then(r=>setSales(prev=>prev.map(s=>s.id===sale.id?{...s,id:r.id}:s)))
      .catch(console.warn)
    // Mark order as confirmed
    updateDoc(doc(db,`users/${user.uid}/orders`,order.id),{status:"confirmed"})
      .then(()=>setOrders(prev=>prev.filter(o=>o.id!==order.id)))
      .catch(console.warn)
  }

  const saveWaNumber = async () => {
    if (!user || waSaving) return
    setWaSaving(true)
    try {
      await updateDoc(doc(db, "users", user.uid), {wa_number: waNumber.trim()})
      toast("Número de WhatsApp guardado")
    } catch(e) { toast("Error al guardar", true) }
    finally { setWaSaving(false) }
  }

  const cancelOrder = id => {
    setOrders(prev=>prev.filter(o=>o.id!==id))
    updateDoc(doc(db,`users/${user.uid}/orders`,id),{status:"cancelled"}).catch(console.warn)
    toast("Pedido cancelado")
  }

  const mLabel = s => {
    if (s.method==="efectivo")      return {l:"● Efectivo", c:C.ok, bg:C.okbg}
    if (s.method==="transferencia") return {l:"● Transfer", c:C.bl, bg:C.blbg}
    return {l:"● Mixto", c:C.am, bg:C.ambg}
  }

  // Shift functions
  const shiftsCol = user ? collection(db, `users/${user.uid}/shifts`) : null

  const openShift = async () => {
    if (!user || !shiftsCol || shiftBusy) return
    setShiftBusy(true)
    try {
      const ref = await addDoc(shiftsCol, {
        status: "open",
        opened_at: Timestamp.now(),
        closed_at: null,
      })
      const snap = await getDoc(doc(db, `users/${user.uid}/shifts`, ref.id))
      const data = {id:ref.id, ...snap.data()}
      setActiveShift(data)
      // Set hist range from now
      const dt = nowLocalDT()
      setHistFrom(dt); setHistTo(nowLocalDT())
      setVendFrom(dt); setVendTo(nowLocalDT())
      toast("✅ Apertura de caja registrada")
    } catch(e) { toast("Error al abrir caja", true) }
    finally { setShiftBusy(false) }
  }

  const generateShiftPDF = (shiftSales, openedD, closedD) => {
    const pad = n => String(n).padStart(2,"0")
    const fmtFull = d =>
      `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0)

    // Aggregate product totals
    const prods = {}
    shiftSales.forEach(s => {
      ;(s.items||[]).forEach(it => {
        if (!prods[it.product_name]) prods[it.product_name] = {name:it.product_name,qty:0,total:0}
        prods[it.product_name].qty   += it.qty
        prods[it.product_name].total += it.product_price * it.qty
      })
    })
    const prodList = Object.values(prods).sort((a,b) => b.qty - a.qty)
    const totalVentas    = shiftSales.reduce((s,v)=>s+v.total,0)
    const totalEfectivo  = shiftSales.reduce((s,v)=>s+(v.cash_paid||0),0)
    const totalMP        = shiftSales.reduce((s,v)=>s+(v.mp_paid||0),0)
    const totalArticulos = shiftSales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0)
    const mayorSales     = shiftSales.filter(v=>v.lista==="mayorista")
    const minorSales     = shiftSales.filter(v=>v.lista!=="mayorista")
    const mayorTotal     = mayorSales.reduce((s,v)=>s+v.total,0)
    const minorTotal     = minorSales.reduce((s,v)=>s+v.total,0)
    const mayorArticulos = mayorSales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0)
    const minorArticulos = minorSales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0)

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Cierre de Caja — MAGO Drinks</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:32px;max-width:720px;margin:auto}
  h1{font-size:26px;font-weight:800;color:#5b21b6;margin-bottom:2px}
  .sub{font-size:13px;color:#666;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
  .row b{color:#111}
  .section{margin-bottom:28px}
  .section h2{font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9333ea;margin-bottom:10px}
  .stat-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px}
  .stat{background:#f5f3ff;border-radius:10px;padding:14px 16px}
  .stat .label{font-size:10px;font-weight:700;letter-spacing:1px;color:#7c3aed;text-transform:uppercase;margin-bottom:4px}
  .stat .val{font-size:22px;font-weight:800;color:#5b21b6}
  .stat .sub-val{font-size:11px;color:#888;margin-top:3px}
  .prod-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f5f3ff;font-size:13px}
  .badge{display:inline-block;background:#ede9fe;color:#7c3aed;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700;margin-right:8px}
  .footer{margin-top:32px;text-align:center;font-size:11px;color:#aaa}
  @media print{body{padding:16px}}
</style>
</head>
<body>
  <h1>🧾 Cierre de Caja</h1>
  <p class="sub">MAGO Drinks POS &nbsp;·&nbsp; Generado el ${fmtFull(new Date())}</p>

  <div class="section">
    <h2>Período</h2>
    <div class="row"><span>Apertura</span><b>${fmtFull(openedD)}</b></div>
    <div class="row"><span>Cierre</span><b>${fmtFull(closedD)}</b></div>
  </div>

  <div class="stat-grid">
    <div class="stat"><div class="label">Total General</div><div class="val">${money(totalVentas)}</div></div>
    <div class="stat"><div class="label">Ventas</div><div class="val">${shiftSales.length}</div></div>
    <div class="stat"><div class="label">Artículos</div><div class="val">${totalArticulos}</div></div>
    <div class="stat"><div class="label">Efectivo</div><div class="val">${money(totalEfectivo)}</div></div>
    <div class="stat"><div class="label">Transfer / MP</div><div class="val">${money(totalMP)}</div></div>
    <div class="stat" style="background:#f0fdf4"><div class="label" style="color:#059669">🏷️ Total Minorista</div><div class="val" style="color:#059669">${money(minorTotal)}</div><div class="sub-val">${minorSales.length} ventas · ${minorArticulos} artículos</div></div>
    <div class="stat" style="background:#fffbeb"><div class="label" style="color:#d97706">📦 Total Mayorista</div><div class="val" style="color:#d97706">${money(mayorTotal)}</div><div class="sub-val">${mayorSales.length} ventas · ${mayorArticulos} artículos</div></div>
  </div>

  <div class="section">
    <h2>Productos vendidos</h2>
    ${prodList.map((p,i) => `
      <div class="prod-row">
        <span><span class="badge">#${i+1}</span>${p.name}</span>
        <span><b>${p.qty}</b> uds &nbsp;·&nbsp; ${money(p.total)}</span>
      </div>`).join("")}
  </div>

  <div class="section">
    <h2>Detalle de ventas (${shiftSales.length})</h2>
    ${shiftSales.map((s,i) => {
      const ts = (s.created_at?.toDate ? s.created_at.toDate() : new Date(s.created_at.seconds*1000))
      const icon = s.method==="efectivo" ? "💵" : s.method==="transferencia" ? "📲" : "🔀"
      const mayBadge = s.lista==="mayorista" ? ' <b style="color:#d97706">MAY</b>' : ""
      return `<div class="row">
        <span>#${shiftSales.length-i} &nbsp; ${fmtFull(ts)} &nbsp; ${icon}${mayBadge}</span>
        <b>${money(s.total)}</b>
      </div>`
    }).join("")}
  </div>

  <div class="footer">MAGO Drinks POS — Documento generado automáticamente al cierre de caja</div>
</body>
</html>`

    const blob = new Blob([html], {type:"text/html"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `cierre-caja-${pad(openedD.getDate())}${pad(openedD.getMonth()+1)}${openedD.getFullYear()}-${pad(openedD.getHours())}${pad(openedD.getMinutes())}.html`
    a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 5000)
  }

  const closeShift = async () => {
    if (!user || !activeShift || shiftBusy) return
    setShiftBusy(true)
    try {
      const closedAt = Timestamp.now()
      const closedD  = closedAt.toDate()
      const openedD  = activeShift.opened_at.toDate()
      const pad = n => String(n).padStart(2,"0")
      const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

      await updateDoc(doc(db, `users/${user.uid}/shifts`, activeShift.id), {
        status: "closed", closed_at: closedAt,
      })

      // Fetch sales for this shift period to include in PDF
      const tsFrom = activeShift.opened_at
      const snap   = await getDocs(query(
        collection(db, `users/${user.uid}/sales`),
        where("created_at",">=",tsFrom),
        where("created_at","<=",closedAt)
      ))
      const shiftSales = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0))

      // Generate and download PDF
      generateShiftPDF(shiftSales, openedD, closedD)

      setHistFrom(fmt(openedD)); setHistTo(fmt(closedD))
      setVendFrom(fmt(openedD)); setVendTo(fmt(closedD))
      setActiveShift(null)
      toast("🔒 Cierre registrado — descargando PDF")
    } catch(e) { console.error(e); toast("Error al cerrar caja", true) }
    finally { setShiftBusy(false) }
  }

  /* ── PUBLIC ORDER PAGE ── */
  if (orderUID) return <OrderPage uid={orderUID}/>

  /* ── STATE GATES ── */
  if (user === undefined) return (
    <div style={{minHeight:"100vh", background:C.bg, display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20}}>
      <style>{CSS}</style>
      <img src="/logo.png" style={{height:64, objectFit:"contain",
        filter:"drop-shadow(0 0 20px rgba(167,139,250,0.4))"}}/>
      <Spin s={28}/>
    </div>
  )

  if (!user)                  return <><style>{CSS}</style><AuthScreen/></>
  if (isAdmin)                return <><style>{CSS}</style><AdminPanel user={user} onLogout={handleLogout} toast={toast}/>{toastEl}</>
  if (userStatus==="suspended") return <><style>{CSS}</style><StatusScreen
    icon="🚫" title="Cuenta suspendida"
    body="Tu acceso al sistema ha sido suspendido."
    note="Contactá al administrador para regularizar tu situación."
    btnLabel="Cerrar sesión" btnColor={C.er} onLogout={handleLogout}/></>
  if (userStatus==="pending")   return <><style>{CSS}</style><StatusScreen
    icon="⏳" title="Pago pendiente"
    body="Tu suscripción mensual tiene un pago pendiente."
    note="Una vez realizado el pago, el administrador activará tu cuenta."
    btnLabel="Cerrar sesión" btnColor={C.am} onLogout={handleLogout}/></>

  /* ── SUB-VIEWS ── */

  const ProdGrid = () => (
    <div style={{padding:"18px 16px"}}>
      {/* header */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:12, gap:8}}>
        <div>
          <h2 style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
            fontSize:18, color:C.tx, margin:0}}>Productos</h2>
          <p style={{fontSize:12, color:C.tx3, margin:0,
            fontFamily:"'DM Mono',monospace"}}>{activeProds.length} artículos</p>
        </div>
        <button onClick={() => setProdModal({p:null})}
          style={{background:`linear-gradient(135deg,${C.v},${C.vm})`, color:"#0f0a1e",
            border:"none", borderRadius:12, padding:"10px 18px",
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:14,
            boxShadow:`0 0 20px ${C.v}44`,
            display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
          <span style={{fontSize:18, lineHeight:1}}>+</span> Agregar
        </button>
      </div>

      {/* lista switcher */}
      <div style={{display:"flex", background:C.card, border:`1px solid ${C.br}`,
        borderRadius:12, padding:4, marginBottom:14, gap:4}}>
        {[
          {k:"minorista", label:"🏷️ Lista Minorista"},
          {k:"mayorista", label:"📦 Lista Mayorista"},
        ].map(({k, label}) => (
          <button key={k} onClick={() => { setLista(k); setCart([]) }}
            style={{flex:1, padding:"9px 0", borderRadius:9, border:"none",
              background: lista===k
                ? k==="mayorista"
                  ? `linear-gradient(135deg,${C.am}33,${C.am}18)`
                  : `linear-gradient(135deg,${C.v}33,${C.v}18)`
                : "transparent",
              color: lista===k
                ? k==="mayorista" ? C.am : C.v
                : C.tx3,
              fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:13,
              letterSpacing:.3, transition:"all .18s",
              boxShadow: lista===k
                ? `0 0 12px ${k==="mayorista" ? C.am : C.v}22`
                : "none",
              border: lista===k
                ? `1px solid ${k==="mayorista" ? C.am : C.v}44`
                : "1px solid transparent",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{position:"relative", marginBottom:16}}>
        <span style={{position:"absolute", left:12, top:"50%",
          transform:"translateY(-50%)", fontSize:14,
          color:C.tx3, pointerEvents:"none"}}>🔍</span>
        <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Buscar producto..."
          style={{width:"100%", background:C.card, border:`1px solid ${C.br}`,
            borderRadius:12, color:C.tx, padding:"11px 36px 11px 38px",
            fontSize:14, outline:"none", fontFamily:"'DM Sans',sans-serif"}}
          onFocus={e=>e.target.style.borderColor=C.v}
          onBlur={e=>e.target.style.borderColor=C.br}/>
        {search && (
          <button onClick={()=>setSearch("")}
            style={{position:"absolute", right:11, top:"50%",
              transform:"translateY(-50%)", background:"none", border:"none",
              color:C.tx3, fontSize:17, padding:4}}>✕</button>
        )}
      </div>

      {/* grid */}
      {loadP ? (
        <div style={{display:"flex", justifyContent:"center", padding:80}}><Spin s={32}/></div>
      ) : filteredProds.length===0 && search ? (
        <div style={{textAlign:"center", padding:"40px 20px", color:C.tx3}}>
          <div style={{fontSize:36, marginBottom:10}}>🔍</div>
          <p style={{fontFamily:"'Space Grotesk',sans-serif",
            fontSize:14, fontWeight:600, color:C.tx2}}>Sin resultados para "{search}"</p>
        </div>
      ) : activeProds.length===0 && !search ? (
        <div style={{textAlign:"center", padding:"50px 20px", color:C.tx3}}>
          <div style={{width:72, height:72, background:C.vbg,
            border:`1px solid ${C.br}`, borderRadius:22,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:32, margin:"0 auto 16px"}}>📦</div>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:15,
            fontWeight:600, color:C.tx2, marginBottom:6}}>Sin productos</h3>
          <p style={{fontSize:13}}>Tocá "+ Agregar" para empezar</p>
        </div>
      ) : (() => {
        // Group products by category
        const groups = {}
        filteredProds.forEach(p => {
          const cat = p.category || "Sin categoría"
          if (!groups[cat]) groups[cat] = []
          groups[cat].push(p)
        })
        // Order: named categories alphabetically, "Sin categoría" last
        const catNames = Object.keys(groups).sort((a,b) => {
          if (a==="Sin categoría") return 1
          if (b==="Sin categoría") return -1
          return a.localeCompare(b)
        })

        const renderCard = p => (
          <div key={p.id}
            style={{background:C.card, border:`1px solid ${C.br}`,
              borderRadius: mobile ? 10 : 16,
              overflow:"hidden", position:"relative",
              boxShadow:C.sh, transition:"border-color .2s, box-shadow .2s"}}
            onMouseEnter={e=>{
              e.currentTarget.style.borderColor=`${C.v}66`
              e.currentTarget.style.boxShadow=`0 0 24px ${C.v}22`}}
            onMouseLeave={e=>{
              e.currentTarget.style.borderColor=C.br
              e.currentTarget.style.boxShadow=C.sh}}>

            {!mobile && (
              <div style={{position:"absolute", top:7, right:7,
                display:"flex", gap:4, zIndex:5}}>
                <button onClick={e=>{e.stopPropagation();setProdModal({p})}}
                  style={{background:"rgba(6,4,17,.8)", border:`1px solid ${C.br}`,
                    borderRadius:7, color:C.v, width:28, height:28,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:13}}>✏️</button>
                <button onClick={e=>{e.stopPropagation();setDelModal(p)}}
                  style={{background:"rgba(6,4,17,.8)", border:`1px solid ${C.br}`,
                    borderRadius:7, color:C.er, width:28, height:28,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:13}}>🗑️</button>
              </div>
            )}

            {mobile && (
              <button onClick={e=>{e.stopPropagation();setProdModal({p})}}
                style={{position:"absolute", top:3, left:3, zIndex:5,
                  background:"rgba(6,4,17,.65)", border:"none",
                  borderRadius:5, color:C.v, width:18, height:18,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:9, lineHeight:1}}>✏️</button>
            )}

            <div onClick={() => addItem(p)}
              style={{cursor:"pointer", WebkitTapHighlightColor:"transparent"}}>
              <div style={{paddingTop: mobile ? "85%" : "72%",
                position:"relative", overflow:"hidden", background:C.vbg}}>
                <img src={p.img} alt={p.name}
                  style={{position:"absolute", inset:0, width:"100%",
                    height:"100%", objectFit:"cover"}}
                  onError={e=>{e.target.src=FALLBACK}}/>
                <div style={{position:"absolute", inset:0,
                  background:`linear-gradient(to top, ${C.card}cc 0%, transparent 55%)`}}/>
                {/* stock badge */}
                {p.stock !== null && p.stock !== undefined && (() => {
                  const noStock  = p.stock <= 0
                  const lowStock = !noStock && p.stock <= (p.stock_min||0)
                  const bg = noStock ? C.er : lowStock ? C.am : C.ok
                  return (
                    <div style={{position:"absolute", bottom:5, right:5,
                      background:`${bg}dd`, color:"#0f0a1e",
                      borderRadius:6, padding: mobile ? "1px 5px" : "2px 8px",
                      fontFamily:"'Space Grotesk',monospace",
                      fontSize: mobile ? 9 : 11, fontWeight:700,
                      lineHeight:1.3, zIndex:3}}>
                      {noStock ? "SIN STOCK" : `${p.stock}`}
                    </div>
                  )
                })()}
              </div>
              <div style={{padding: mobile ? "5px 5px 6px" : "10px 12px"}}>
                <div style={{fontSize: mobile ? 9 : 13, fontWeight:600,
                  color:C.tx, lineHeight:1.25, marginBottom: mobile ? 1 : 4,
                  overflow:"hidden", display:"-webkit-box",
                  WebkitLineClamp:2, WebkitBoxOrient:"vertical"}}>
                  {p.name}
                </div>
                <div style={{fontFamily:"'Space Grotesk',monospace",
                  fontSize: mobile ? 10 : 15, fontWeight:700, color:C.v}}>
                  {$(p.price)}
                </div>
              </div>
            </div>
          </div>
        )

        return (
          <div>
            {catNames.map(cat => (
              <div key={cat} style={{marginBottom:22}}>
                {/* category title */}
                <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
                  <h3 style={{fontFamily:"'Space Grotesk',sans-serif",
                    fontWeight:700, fontSize: mobile ? 14 : 16,
                    color: cat==="Sin categoría" ? C.tx3 : C.v, margin:0,
                    whiteSpace:"nowrap"}}>
                    {cat}
                  </h3>
                  <span style={{fontFamily:"'DM Mono',monospace", fontSize:11,
                    color:C.tx3, background:C.card2, padding:"2px 8px",
                    borderRadius:20, fontWeight:600}}>
                    {groups[cat].length}
                  </span>
                  <div style={{flex:1, height:1, background:C.br}}/>
                </div>
                {/* products grid for this category */}
                <div style={{display:"grid",
                  gridTemplateColumns: mobile ? "repeat(4,1fr)" : "repeat(auto-fill,minmax(145px,1fr))",
                  gap: mobile ? 6 : 12}}>
                  {groups[cat].map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )

  const CartPanel = () => (
    <div style={{display:"flex", flexDirection:"column", height:"100%",
      background:C.card, borderLeft:`1px solid ${C.br}`}}>

      {/* header */}
      <div style={{padding:"14px 16px 10px", borderBottom:`1px solid ${C.br}`,
        display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div style={{display:"flex", flexDirection:"column", gap:3}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
            fontSize:15, color:C.tx, margin:0,
            display:"flex", alignItems:"center", gap:8}}>
            Carrito
            {cartQty > 0 && (
              <span style={{background:`linear-gradient(135deg,${C.v},${C.vm})`,
                color:"#0f0a1e", borderRadius:20, padding:"2px 9px",
                fontSize:12, fontWeight:700}}>{cartQty}</span>
            )}
          </h3>
          <span style={{fontSize:10, fontWeight:700, letterSpacing:.8,
            fontFamily:"'Space Grotesk',sans-serif", textTransform:"uppercase",
            color: lista==="mayorista" ? C.am : C.v}}>
            {lista==="mayorista" ? "📦 Mayorista" : "🏷️ Minorista"}
          </span>
        </div>
        {cart.length > 0 && (
          <button onClick={() => setCart([])}
            style={{background:C.erbg, border:`1px solid ${C.er}33`,
              borderRadius:8, color:C.er, padding:"5px 12px",
              fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
            Vaciar
          </button>
        )}
      </div>

      {/* items */}
      <div style={{flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch"}}>
        {cart.length === 0 ? (
          <div style={{textAlign:"center", padding:"46px 20px", color:C.tx3}}>
            <div style={{width:60, height:60, background:C.vbg,
              border:`1px solid ${C.br}`,
              borderRadius:18, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:26, margin:"0 auto 14px"}}>🛒</div>
            <p style={{fontFamily:"'DM Sans',sans-serif",
              fontSize:13, fontWeight:500, lineHeight:1.7}}>
              Tocá un producto<br/>para agregar
            </p>
          </div>
        ) : cart.map(it => (
          <div key={it.id}
            style={{display:"flex", alignItems:"center",
              padding:"10px 14px", borderBottom:`1px solid ${C.br}`, gap:10}}>
            <img src={it.img} alt={it.name}
              style={{width:40, height:40, borderRadius:9, objectFit:"cover",
                flexShrink:0, border:`1px solid ${C.br}`}}
              onError={e=>{e.target.src=FALLBACK}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600, color:C.tx,
                whiteSpace:"nowrap", overflow:"hidden",
                textOverflow:"ellipsis"}}>{it.name}</div>
              <div style={{fontFamily:"'Space Grotesk',monospace",
                fontSize:12, color:C.v, fontWeight:700}}>
                {$(it.price * it.qty)}
              </div>
            </div>
            <div style={{display:"flex", alignItems:"center", gap:5, flexShrink:0}}>
              <button onClick={() => setQty(it.id, it.qty-1)}
                style={{width:30, height:30, background:C.card2,
                  border:`1px solid ${C.br}`, borderRadius:8,
                  color:C.tx2, fontSize:20, display:"flex",
                  alignItems:"center", justifyContent:"center", fontWeight:700}}>−</button>
              <span style={{fontFamily:"'Space Grotesk',monospace",
                fontSize:15, color:C.tx, minWidth:22,
                textAlign:"center", fontWeight:700}}>{it.qty}</span>
              <button onClick={() => setQty(it.id, it.qty+1)}
                style={{width:30, height:30, background:C.vbg,
                  border:`1px solid ${C.v}44`, borderRadius:8,
                  color:C.v, fontSize:20, display:"flex",
                  alignItems:"center", justifyContent:"center", fontWeight:700}}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{borderTop:`1px solid ${C.br}`, padding:"14px 14px 16px",
        background:C.card2}}>

        {/* discount row */}
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
            fontWeight:700, color:C.tx3, letterSpacing:.8, textTransform:"uppercase",
            flexShrink:0}}>Descuento</span>
          <div style={{flex:1, position:"relative"}}>
            <span style={{position:"absolute", left:10, top:"50%",
              transform:"translateY(-50%)", fontFamily:"'Space Grotesk',monospace",
              fontSize:13, color:C.tx3, pointerEvents:"none"}}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={discount}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9]/g,"")
                setDiscount(v)
              }}
              placeholder="0"
              style={{width:"100%", background:C.card, border:`1px solid ${C.br}`,
                borderRadius:8, color:discountAmt>0 ? C.er : C.tx,
                padding:"8px 10px 8px 22px",
                fontFamily:"'Space Grotesk',monospace", fontSize:14, fontWeight:600,
                outline:"none", boxSizing:"border-box"}}
              onFocus={e=>e.target.style.borderColor=C.er}
              onBlur={e=>e.target.style.borderColor=C.br}/>
          </div>
          {discountAmt > 0 && (
            <button onClick={() => setDiscount("")}
              style={{background:"none", border:"none", color:C.tx3,
                fontSize:16, padding:4, flexShrink:0}}>✕</button>
          )}
        </div>

        {/* subtotal + discount lines */}
        {discountAmt > 0 && (
          <div style={{marginBottom:8}}>
            <div style={{display:"flex", justifyContent:"space-between",
              alignItems:"baseline", marginBottom:3}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:12,
                fontWeight:500, color:C.tx3}}>Subtotal</span>
              <span style={{fontFamily:"'Space Grotesk',monospace", fontSize:14,
                fontWeight:600, color:C.tx3}}>{$(cartTotal)}</span>
            </div>
            <div style={{display:"flex", justifyContent:"space-between",
              alignItems:"baseline"}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:12,
                fontWeight:600, color:C.er}}>− Descuento</span>
              <span style={{fontFamily:"'Space Grotesk',monospace", fontSize:14,
                fontWeight:700, color:C.er}}>− {$(discountAmt)}</span>
            </div>
          </div>
        )}

        {/* final total */}
        <div style={{display:"flex", justifyContent:"space-between",
          alignItems:"baseline", marginBottom:12,
          borderTop: discountAmt>0 ? `1px solid ${C.br}` : "none",
          paddingTop: discountAmt>0 ? 8 : 0}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",
            fontSize:13, fontWeight:700, color:C.tx2, letterSpacing:.5,
            textTransform:"uppercase"}}>Total</span>
          <span style={{fontFamily:"'Space Grotesk',monospace",
            fontSize:30, fontWeight:700, letterSpacing:-1,
            color: discountAmt>0 ? C.ok : C.tx}}>
            {$(cartFinal)}
          </span>
        </div>

        <button onClick={() => {
          if (!cart.length) return toast("Carrito vacío")
          setPayModal(true)
        }}
          style={{width:"100%",
            background: cart.length
              ? `linear-gradient(135deg,${C.v},${C.vm})`
              : C.card,
            color:     cart.length ? "#0f0a1e" : C.tx3,
            border:    cart.length ? "none" : `1px solid ${C.br}`,
            borderRadius:12, padding:"15px 0",
            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:18,
            boxShadow: cart.length ? `0 0 24px ${C.v}44` : "none",
            cursor:    cart.length ? "pointer" : "not-allowed"}}>
          Cobrar
        </button>
      </div>
    </div>
  )

  return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh", background:C.bg, color:C.tx,
        backgroundImage:`radial-gradient(ellipse at 50% -20%, rgba(167,139,250,0.06) 0%, transparent 55%)`}}>

        {/* ── HEADER ── */}
        <header style={{background:`${C.card}f0`, borderBottom:`1px solid ${C.br}`,
          padding:"0 16px", display:"flex", alignItems:"center",
          justifyContent:"space-between", height:62,
          position:"sticky", top:0, zIndex:100, boxShadow:C.sh, gap:10}}>

          <img src="/logo.png" alt="MAGO" style={{height:42, objectFit:"contain",
            filter:"drop-shadow(0 0 12px rgba(167,139,250,0.3))"}}/>

          <div style={{display:"flex", alignItems:"center", gap:6}}>
            {[["caja","🏪","CAJA"],["pedidos","🛵","PEDIDOS"],["hist","📊","HISTORIAL"],["vendidos","📦","VENDIDOS"]].map(([k,ic,l]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  background: tab===k ? C.vbg : "transparent",
                  color:      tab===k ? C.v   : C.tx3,
                  border: `1px solid ${tab===k ? C.v+"66" : C.br}`,
                  borderRadius:10, padding:"8px 12px",
                  fontFamily:"'Space Grotesk',sans-serif", fontWeight:600,
                  fontSize:12, letterSpacing:.5,
                  boxShadow: tab===k ? `0 0 16px ${C.v}22` : "none",
                  display:"flex", alignItems:"center", gap:5}}>
                <span>{ic}</span> <span>{l}</span>
              </button>
            ))}

            {/* user chip */}
            <div style={{display:"flex", alignItems:"center", gap:8,
              marginLeft:4, paddingLeft:10, borderLeft:`1px solid ${C.br}`}}>
              <div style={{width:30, height:30,
                background:`linear-gradient(135deg,${C.v}44,${C.vm}22)`,
                border:`1px solid ${C.v}44`,
                borderRadius:9, display:"flex", alignItems:"center",
                justifyContent:"center", color:C.v,
                fontFamily:"'Space Grotesk',sans-serif",
                fontWeight:700, fontSize:13, flexShrink:0}}>
                {(user.displayName || user.email || "?")[0].toUpperCase()}
              </div>
              <button onClick={handleLogout}
                style={{background:C.erbg, border:`1px solid ${C.er}33`,
                  borderRadius:8, color:C.er, padding:"6px 10px",
                  fontFamily:"'DM Sans',sans-serif",
                  fontSize:11, fontWeight:700, whiteSpace:"nowrap"}}>
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* ── CAJA ── */}
        {tab==="caja" && (
          mobile ? (
            <div style={{height:"calc(100vh - 62px)", display:"flex", flexDirection:"column"}}>
              <div style={{display:"flex", background:C.card, borderBottom:`1px solid ${C.br}`}}>
                {[["prods","🏪 Productos"],["cart",`🛒 Carrito (${cartQty})`]].map(([v,l]) => (
                  <button key={v} onClick={() => setMView(v)}
                    style={{flex:1, padding:"12px 0", background:"transparent",
                      color: mView===v ? C.v : C.tx3, border:"none",
                      borderBottom:`2px solid ${mView===v ? C.v : "transparent"}`,
                      fontFamily:"'Space Grotesk',sans-serif",
                      fontWeight:600, fontSize:13, letterSpacing:.3}}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{flex:1, overflow:"auto", WebkitOverflowScrolling:"touch"}}>
                {mView==="prods" ? ProdGrid() : CartPanel()}
              </div>
            </div>
          ) : (
            <div style={{display:"grid", gridTemplateColumns:"1fr 315px",
              height:"calc(100vh - 62px)", overflow:"hidden"}}>
              <div style={{overflowY:"auto", background:C.bg}}>{ProdGrid()}</div>
              <div style={{overflow:"hidden"}}>{CartPanel()}</div>
            </div>
          )
        )}

        {/* ── HISTORIAL ── */}
        {tab==="hist" && (
          <div style={{maxWidth:880, margin:"0 auto", padding:"24px 16px"}}>

            {/* title + shift bar */}
            <div style={{marginBottom:20}}>
              <h2 style={{fontFamily:"'Space Grotesk',sans-serif",
                fontWeight:700, fontSize:22, color:C.tx, margin:"0 0 4px"}}>
                Historial de ventas
              </h2>
              <p style={{fontFamily:"'DM Mono',monospace", fontSize:12, color:C.tx3, margin:0}}>
                {st.count} ventas en el rango seleccionado
              </p>
            </div>

            {/* ── SHIFT BAR ── */}
            <div style={{background:C.card, border:`1px solid ${activeShift ? C.ok+"55" : C.br}`,
              borderRadius:14, padding:"14px 16px", marginBottom:20,
              display:"flex", alignItems:"center", justifyContent:"space-between",
              flexWrap:"wrap", gap:12,
              boxShadow: activeShift ? `0 0 20px ${C.ok}15` : C.sh}}>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <div style={{width:10, height:10, borderRadius:"50%",
                  background: activeShift ? C.ok : C.tx3,
                  boxShadow: activeShift ? `0 0 8px ${C.ok}` : "none",
                  flexShrink:0}}/>
                <div>
                  <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:13,
                    fontWeight:600, color: activeShift ? C.ok : C.tx2, margin:0}}>
                    {activeShift ? "Caja abierta" : "Caja cerrada"}
                  </p>
                  {activeShift && (
                    <p style={{fontFamily:"'DM Mono',monospace", fontSize:11,
                      color:C.tx3, margin:0}}>
                      Apertura: {fmtDT(activeShift.opened_at)}
                    </p>
                  )}
                </div>
              </div>
              <div style={{display:"flex", gap:8}}>
                {!activeShift ? (
                  <button onClick={openShift} disabled={shiftBusy}
                    style={{background:`linear-gradient(135deg,${C.ok},${C.ok}bb)`,
                      border:"none", borderRadius:10, color:"#0a1f14",
                      padding:"9px 18px", fontFamily:"'Space Grotesk',sans-serif",
                      fontWeight:700, fontSize:13, letterSpacing:.3,
                      boxShadow:`0 0 16px ${C.ok}44`,
                      display:"flex", alignItems:"center", gap:7}}>
                    {shiftBusy ? <Spin s={14} c="#0a1f14"/> : "🔓"} Abrir caja
                  </button>
                ) : (
                  <button onClick={closeShift} disabled={shiftBusy}
                    style={{background:`linear-gradient(135deg,${C.er},${C.er}bb)`,
                      border:"none", borderRadius:10, color:"#1f0a0a",
                      padding:"9px 18px", fontFamily:"'Space Grotesk',sans-serif",
                      fontWeight:700, fontSize:13, letterSpacing:.3,
                      boxShadow:`0 0 16px ${C.er}44`,
                      display:"flex", alignItems:"center", gap:7}}>
                    {shiftBusy ? <Spin s={14} c="#1f0a0a"/> : "🔒"} Cerrar caja
                  </button>
                )}
              </div>
            </div>

            {/* ── DATE RANGE FILTER ── */}
            <div style={{background:C.card, border:`1px solid ${C.br}`,
              borderRadius:14, padding:"14px 16px", marginBottom:24, boxShadow:C.sh}}>
              <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
                fontWeight:700, color:C.tx3, letterSpacing:1,
                textTransform:"uppercase", marginBottom:12}}>Rango de consulta</p>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                {[
                  {label:"Desde", val:histFrom, set:setHistFrom},
                  {label:"Hasta", val:histTo,   set:setHistTo},
                ].map(({label,val,set}) => (
                  <div key={label}>
                    <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
                      fontSize:10, fontWeight:700, color:C.tx3, letterSpacing:1,
                      textTransform:"uppercase", marginBottom:6}}>{label}</label>
                    <input type="datetime-local" value={val} onChange={e=>set(e.target.value)}
                      style={{width:"100%", background:C.card2, border:`1px solid ${C.br}`,
                        borderRadius:9, color:C.tx, padding:"9px 12px",
                        fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
                        outline:"none", colorScheme:"dark"}}
                      onFocus={e=>e.target.style.borderColor=C.v}
                      onBlur={e=>e.target.style.borderColor=C.br}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap"}}>
                <button onClick={()=>{setHistFrom(startOfDayDT());setHistTo(nowLocalDT())}}
                  style={{padding:"7px 14px", borderRadius:8, border:`1px solid ${C.br}`,
                    background:C.card2, color:C.tx2,
                    fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                  Hoy
                </button>
                <button onClick={()=>{
                  const d=new Date(); d.setDate(d.getDate()-1)
                  const pad=n=>String(n).padStart(2,"0")
                  const ymd=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
                  setHistFrom(`${ymd}T00:00`); setHistTo(`${ymd}T23:59`)
                }} style={{padding:"7px 14px", borderRadius:8, border:`1px solid ${C.br}`,
                    background:C.card2, color:C.tx2,
                    fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                  Ayer
                </button>
                {activeShift && (
                  <button onClick={()=>{
                    const d=activeShift.opened_at.toDate()
                    const pad=n=>String(n).padStart(2,"0")
                    const fmt=x=>`${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
                    setHistFrom(fmt(d)); setHistTo(nowLocalDT())
                  }} style={{padding:"7px 14px", borderRadius:8,
                      border:`1px solid ${C.ok}44`, background:C.okbg,
                      color:C.ok, fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                    Turno actual
                  </button>
                )}
              </div>
            </div>
            <div style={{display:"grid",
              gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
              gap:10, marginBottom:24}}>
              {[
                {l:"Total",      v:$(st.total), c:C.v,  bg:C.vbg,  i:"💰"},
                {l:"Efectivo",   v:$(st.ef),    c:C.ok, bg:C.okbg, i:"💵"},
                {l:"Transfer",   v:$(st.mp),    c:C.bl, bg:C.blbg, i:"📲"},
                {l:"Artículos",  v:st.items,    c:C.am, bg:C.ambg, i:"📦"},
                {l:"Ventas",     v:st.count,    c:C.v,  bg:C.vbg,  i:"🧾"},
                {l:"Mayorista",  v:$(st.mayor), c:C.am, bg:C.ambg, i:"📦"},
              ].map(({l,v,c,bg,i}) => (
                <div key={l}
                  style={{background:C.card, border:`1px solid ${C.br}`,
                    borderRadius:14, padding:"14px 16px", boxShadow:C.sh}}>
                  <div style={{display:"flex", alignItems:"center",
                    gap:6, marginBottom:8}}>
                    <span style={{fontSize:14}}>{i}</span>
                    <span style={{fontFamily:"'Space Grotesk',sans-serif",
                      fontSize:10, fontWeight:600, color:C.tx3,
                      letterSpacing:1, textTransform:"uppercase"}}>{l}</span>
                  </div>
                  <div style={{fontFamily:"'Space Grotesk',monospace",
                    fontWeight:700, fontSize:20, color:c, letterSpacing:-1}}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            {/* sales list */}
            {loadS ? (
              <div style={{display:"flex", justifyContent:"center", padding:60}}>
                <Spin s={28}/>
              </div>
            ) : sales.length === 0 ? (
              <div style={{textAlign:"center", padding:"50px 0", color:C.tx3}}>
                <div style={{width:68, height:68, background:C.vbg,
                  border:`1px solid ${C.br}`,
                  borderRadius:20, display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:30, margin:"0 auto 14px"}}>📋</div>
                <h3 style={{fontFamily:"'Space Grotesk',sans-serif",
                  fontSize:15, fontWeight:600, color:C.tx2, marginBottom:4}}>
                  Sin ventas este día
                </h3>
              </div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap:8}}>
                {sales.map((s,i) => {
                  const m  = mLabel(s)
                  const ts = (s.created_at?.toDate
                    ? s.created_at.toDate()
                    : new Date(s.created_at.seconds*1000))
                    .toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
                  return (
                    <div key={s.id}
                      style={{background:C.card, border:`1px solid ${C.br}`,
                        borderRadius:14, padding:"14px 18px", boxShadow:C.sh}}>
                      <div style={{display:"flex", justifyContent:"space-between",
                        alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:8}}>
                        <div style={{display:"flex", alignItems:"center",
                          gap:8, flexWrap:"wrap"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",
                            fontSize:11, color:C.tx3, background:C.card2,
                            padding:"2px 8px", borderRadius:6, fontWeight:600}}>
                            #{sales.length-i}
                          </span>
                          <span style={{fontFamily:"'DM Mono',monospace",
                            fontSize:12, color:C.tx3, fontWeight:500}}>{ts}</span>
                          <span style={{fontFamily:"'Space Grotesk',sans-serif",
                            fontSize:11, fontWeight:600, letterSpacing:.5,
                            padding:"3px 10px", borderRadius:20,
                            background:m.bg, color:m.c,
                            border:`1px solid ${m.c}33`}}>{m.l}</span>
                          {s.lista==="mayorista" && (
                            <span style={{fontFamily:"'Space Grotesk',sans-serif",
                              fontSize:10, fontWeight:700, letterSpacing:.6,
                              padding:"3px 9px", borderRadius:20,
                              background:C.ambg, color:C.am,
                              border:`1px solid ${C.am}33`}}>📦 MAY</span>
                          )}
                          {s.discount > 0 && (
                            <span style={{fontFamily:"'Space Grotesk',sans-serif",
                              fontSize:10, fontWeight:700, letterSpacing:.6,
                              padding:"3px 9px", borderRadius:20,
                              background:C.erbg, color:C.er,
                              border:`1px solid ${C.er}33`}}>− {$(s.discount)}</span>
                          )}
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <span style={{fontFamily:"'Space Grotesk',monospace",
                            fontWeight:700, fontSize:18, color:C.tx, letterSpacing:-1}}>
                            {$(s.total)}
                          </span>
                          <button onClick={()=>setDelSaleModal(s)}
                            style={{background:C.erbg, border:`1px solid ${C.er}33`,
                              borderRadius:8, color:C.er, width:30, height:30,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:13, flexShrink:0}}>🗑️</button>
                        </div>
                      </div>
                      <p style={{fontSize:13, color:C.tx2, lineHeight:1.5,
                        fontFamily:"'DM Sans',sans-serif",
                        marginBottom:(s.change_amount>0||s.method==="mixto")?6:0}}>
                        {(s.items||[]).map(it=>`${it.product_name} ×${it.qty}`).join("  ·  ")}
                      </p>
                      {(s.method==="mixto" || s.change_amount>0) && (
                        <div style={{display:"flex", gap:7, flexWrap:"wrap", marginTop:5}}>
                          {s.method==="mixto" && <>
                            <span style={{fontFamily:"'DM Mono',monospace", fontSize:12,
                              color:C.ok, background:C.okbg, padding:"3px 10px",
                              borderRadius:20, fontWeight:600,
                              border:`1px solid ${C.ok}33`}}>
                              💵 {$(s.cash_paid)}
                            </span>
                            <span style={{fontFamily:"'DM Mono',monospace", fontSize:12,
                              color:C.bl, background:C.blbg, padding:"3px 10px",
                              borderRadius:20, fontWeight:600,
                              border:`1px solid ${C.bl}33`}}>
                              📲 {$(s.mp_paid)}
                            </span>
                          </>}
                          {s.change_amount > 0 && (
                            <span style={{fontFamily:"'DM Mono',monospace", fontSize:12,
                              color:C.am, background:C.ambg, padding:"3px 10px",
                              borderRadius:20, fontWeight:600,
                              border:`1px solid ${C.am}33`}}>
                              ↩ {$(s.change_amount)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}


        {/* ── PEDIDOS ── */}
        {tab==="pedidos" && (
          <div style={{maxWidth:760, margin:"0 auto", padding:"24px 16px"}}>

            {/* header + share link */}
            <div style={{display:"flex", alignItems:"flex-start",
              justifyContent:"space-between", marginBottom:22,
              flexWrap:"wrap", gap:12}}>
              <div>
                <h2 style={{fontFamily:"'Space Grotesk',sans-serif",
                  fontWeight:700, fontSize:22, color:C.tx, margin:"0 0 4px"}}>
                  Pedidos pendientes
                </h2>
                <p style={{fontFamily:"'DM Mono',monospace",
                  fontSize:12, color:C.tx3, margin:0}}>
                  {orders.length} pedido{orders.length!==1?"s":""} en espera
                </p>
              </div>

              {/* WhatsApp share */}
              <div style={{display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end"}}>
                <div style={{background:C.card, border:`1px solid ${C.br}`,
                  borderRadius:10, padding:"8px 12px",
                  fontFamily:"'DM Mono',monospace", fontSize:11, color:C.tx3,
                  maxWidth:260, wordBreak:"break-all"}}>
                  {`${window.location.origin}/?order=${user?.uid}`}
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={()=>{
                    navigator.clipboard.writeText(`${window.location.origin}/?order=${user?.uid}`)
                    toast("Link copiado")
                  }} style={{padding:"8px 14px", borderRadius:9,
                      border:`1px solid ${C.br}`, background:C.card,
                      color:C.tx2, fontFamily:"'DM Sans',sans-serif",
                      fontSize:12, fontWeight:600}}>
                    📋 Copiar link
                  </button>
                  <button onClick={()=>{
                    const url = encodeURIComponent(`${window.location.origin}/?order=${user?.uid}`)
                    const txt = encodeURIComponent(`Hola! Podés hacer tu pedido acá: ${window.location.origin}/?order=${user?.uid}`)
                    window.open(`https://wa.me/?text=${txt}`)
                  }} style={{padding:"8px 14px", borderRadius:9,
                      border:"none",
                      background:"linear-gradient(135deg,#25d366,#128c7e)",
                      color:"#fff", fontFamily:"'DM Sans',sans-serif",
                      fontSize:12, fontWeight:700,
                      boxShadow:"0 4px 14px #25d36644"}}>
                    🟢 Enviar por WhatsApp
                  </button>
                </div>
              </div>
            </div>

            {/* ── CONFIG WHATSAPP NEGOCIO ── */}
            <div style={{background:C.card, border:`1px solid ${C.br}`,
              borderRadius:14, padding:"16px 18px", marginBottom:22, boxShadow:C.sh}}>
              <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
                fontWeight:700, color:C.tx3, letterSpacing:1,
                textTransform:"uppercase", marginBottom:4}}>
                🟢 WhatsApp del negocio
              </p>
              <p style={{fontSize:12, color:C.tx3, marginBottom:12, lineHeight:1.5}}>
                Cuando un cliente envía un pedido, se abre WhatsApp con el resumen hacia este número. Incluí código de país sin "+" (ej: 549341...).
              </p>
              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                <input type="text" inputMode="numeric" value={waNumber}
                  onChange={e=>setWaNumber(e.target.value.replace(/[^0-9]/g,""))}
                  placeholder="Ej: 5493411234567"
                  style={{flex:1, minWidth:180, background:C.card2,
                    border:`1px solid ${C.br}`, borderRadius:9, color:C.tx,
                    padding:"10px 13px", fontFamily:"'DM Mono',monospace",
                    fontSize:14, outline:"none"}}
                  onFocus={e=>e.target.style.borderColor=C.v}
                  onBlur={e=>e.target.style.borderColor=C.br}/>
                <button onClick={saveWaNumber} disabled={waSaving}
                  style={{padding:"10px 20px", border:"none", borderRadius:9,
                    background:`linear-gradient(135deg,${C.v},${C.vm})`,
                    color:"#0f0a1e", fontFamily:"'Space Grotesk',sans-serif",
                    fontWeight:700, fontSize:13, cursor:waSaving?"wait":"pointer",
                    boxShadow:`0 0 14px ${C.v}33`}}>
                  {waSaving ? "..." : "Guardar"}
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <div style={{textAlign:"center", padding:"60px 0", color:C.tx3}}>
                <div style={{width:72, height:72, background:C.vbg,
                  border:`1px solid ${C.br}`, borderRadius:22,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:32, margin:"0 auto 16px"}}>🛵</div>
                <h3 style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:15,
                  fontWeight:600, color:C.tx2, marginBottom:6}}>
                  Sin pedidos pendientes
                </h3>
                <p style={{fontSize:13, color:C.tx3}}>
                  Compartí el link para recibir pedidos
                </p>
              </div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                {orders.map(order => {
                  const ts = (order.created_at?.toDate
                    ? order.created_at.toDate()
                    : new Date(order.created_at.seconds*1000))
                    .toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
                  return (
                    <div key={order.id}
                      style={{background:C.card, border:`1px solid ${C.v}33`,
                        borderRadius:14, padding:"16px 18px",
                        boxShadow:`0 0 20px ${C.v}10`}}>
                      <div style={{display:"flex", justifyContent:"space-between",
                        alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:10}}>
                        <div style={{display:"flex", alignItems:"center", gap:10}}>
                          <div style={{width:36, height:36,
                            background:`linear-gradient(135deg,${C.v}33,${C.vm}22)`,
                            border:`1px solid ${C.v}44`, borderRadius:10,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontFamily:"'Space Grotesk',sans-serif",
                            fontWeight:700, fontSize:16, color:C.v}}>
                            {order.customer_name[0].toUpperCase()}
                          </div>
                          <div>
                            <p style={{fontFamily:"'Space Grotesk',sans-serif",
                              fontSize:15, fontWeight:700, color:C.tx, margin:0}}>
                              {order.customer_name}
                            </p>
                            <p style={{fontFamily:"'DM Mono',monospace",
                              fontSize:11, color:C.tx3, margin:0}}>{ts}</p>
                          </div>
                        </div>
                        <span style={{fontFamily:"'Space Grotesk',monospace",
                          fontSize:20, fontWeight:700, color:C.v, letterSpacing:-1}}>
                          {$(order.total)}
                        </span>
                      </div>

                      <div style={{fontSize:13, color:C.tx2, marginBottom:8,
                        lineHeight:1.6}}>
                        {(order.items||[]).map(it=>`${it.product_name} ×${it.qty}`).join("  ·  ")}
                      </div>

                      {order.notes && (
                        <p style={{fontSize:12, color:C.am,
                          background:C.ambg, borderRadius:6,
                          padding:"4px 10px", display:"inline-block",
                          border:`1px solid ${C.am}33`, marginBottom:10}}>
                          📝 {order.notes}
                        </p>
                      )}

                      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                        <button onClick={()=>setOrderToPay(order)}
                          style={{flex:1, minWidth:120, padding:"10px 0",
                            background:`linear-gradient(135deg,${C.ok},${C.ok}bb)`,
                            border:"none", borderRadius:10, color:"#0a1f14",
                            fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                            fontSize:13, boxShadow:`0 0 14px ${C.ok}44`,
                            cursor:"pointer"}}>
                          💳 Cobrar pedido
                        </button>
                        <button onClick={()=>cancelOrder(order.id)}
                          style={{padding:"10px 16px",
                            background:C.erbg, border:`1px solid ${C.er}33`,
                            borderRadius:10, color:C.er,
                            fontFamily:"'DM Sans',sans-serif", fontWeight:600,
                            fontSize:13, cursor:"pointer"}}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCTOS VENDIDOS ── */}
        {tab==="vendidos" && (() => {
          const _vg = {}
          vendSales.forEach(sale => {
            ;(sale.items||[]).forEach(it => {
              if (!_vg[it.product_name]) _vg[it.product_name] = {name:it.product_name, qty:0}
              _vg[it.product_name].qty += it.qty
            })
          })
          const ranked = Object.values(_vg).sort((a,b) => b.qty - a.qty)
          const totalUnits = ranked.reduce((s,r) => s+r.qty, 0)
          const maxQty = ranked[0]?.qty || 1

          // Medal chars as JS strings — no HTML entities
          const medal = (i) => i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : null

          const rankColors = [
            { bg:`linear-gradient(135deg,${C.am}25,${C.am}10)`, border:`${C.am}44`, text:C.am },
            { bg:`linear-gradient(135deg,#94a3b822,#94a3b810)`, border:`#94a3b833`,  text:"#94a3b8" },
            { bg:`linear-gradient(135deg,${C.am}15,${C.am}05)`, border:`${C.am}28`,  text:`${C.am}99` },
          ]

          return (
            <div style={{maxWidth:680, margin:"0 auto", padding:"24px 16px 40px"}}>

              {/* ── HEADER ── */}
              <div style={{marginBottom:18}}>
                <h2 style={{fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                  fontSize:22, color:C.tx, margin:"0 0 4px"}}>
                  Productos Vendidos
                </h2>
                <p style={{fontFamily:"'DM Mono',monospace", fontSize:12, color:C.tx3}}>
                  {ranked.length} productos · {totalUnits} unidades totales
                </p>
              </div>

              {/* ── DATE RANGE ── */}
              <div style={{background:C.card, border:`1px solid ${C.br}`,
                borderRadius:14, padding:"14px 16px", marginBottom:22, boxShadow:C.sh}}>
                <p style={{fontFamily:"'Space Grotesk',sans-serif", fontSize:11,
                  fontWeight:700, color:C.tx3, letterSpacing:1,
                  textTransform:"uppercase", marginBottom:12}}>Rango</p>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                  {[
                    {label:"Desde", val:vendFrom, set:setVendFrom},
                    {label:"Hasta", val:vendTo,   set:setVendTo},
                  ].map(({label,val,set}) => (
                    <div key={label}>
                      <label style={{display:"block", fontFamily:"'Space Grotesk',sans-serif",
                        fontSize:10, fontWeight:700, color:C.tx3, letterSpacing:1,
                        textTransform:"uppercase", marginBottom:6}}>{label}</label>
                      <input type="datetime-local" value={val} onChange={e=>set(e.target.value)}
                        style={{width:"100%", background:C.card2, border:`1px solid ${C.br}`,
                          borderRadius:9, color:C.tx, padding:"9px 12px",
                          fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
                          outline:"none", colorScheme:"dark"}}
                        onFocus={e=>e.target.style.borderColor=C.v}
                        onBlur={e=>e.target.style.borderColor=C.br}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap"}}>
                  <button onClick={()=>{setVendFrom(startOfDayDT());setVendTo(nowLocalDT())}}
                    style={{padding:"7px 14px", borderRadius:8, border:`1px solid ${C.br}`,
                      background:C.card2, color:C.tx2,
                      fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                    Hoy
                  </button>
                  <button onClick={()=>{
                    const d=new Date(); d.setDate(d.getDate()-1)
                    const pad=n=>String(n).padStart(2,"0")
                    const ymd=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
                    setVendFrom(`${ymd}T00:00`); setVendTo(`${ymd}T23:59`)
                  }} style={{padding:"7px 14px", borderRadius:8, border:`1px solid ${C.br}`,
                      background:C.card2, color:C.tx2,
                      fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                    Ayer
                  </button>
                  {activeShift && (
                    <button onClick={()=>{
                      const d=activeShift.opened_at.toDate()
                      const pad=n=>String(n).padStart(2,"0")
                      const fmt=x=>`${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
                      setVendFrom(fmt(d)); setVendTo(nowLocalDT())
                    }} style={{padding:"7px 14px", borderRadius:8,
                        border:`1px solid ${C.ok}44`, background:C.okbg,
                        color:C.ok, fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600}}>
                      Turno actual
                    </button>
                  )}
                </div>
              </div>

              {/* ── CONTENT ── */}
              {loadV ? (
                <div style={{display:"flex", justifyContent:"center", padding:80}}>
                  <Spin s={32}/>
                </div>

              ) : ranked.length === 0 ? (
                <div style={{textAlign:"center", padding:"70px 0", color:C.tx3}}>
                  <div style={{width:76, height:76, background:C.vbg,
                    border:`1px solid ${C.br}`, borderRadius:22,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:34, margin:"0 auto 18px"}}>📦</div>
                  <h3 style={{fontFamily:"'Space Grotesk',sans-serif",
                    fontSize:16, fontWeight:600, color:C.tx2, marginBottom:8}}>
                    Sin ventas este día
                  </h3>
                  <p style={{fontSize:13, color:C.tx3, lineHeight:1.6}}>
                    No se registraron productos vendidos
                  </p>
                </div>

              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:6}}>

                  {ranked.map((item, i) => {
                    const pct    = (item.qty / maxQty) * 100
                    const isTop  = i === 0
                    const rk     = rankColors[i] || {bg:C.vbg, border:C.br, text:C.v}
                    const m      = medal(i)

                    // progress bar color
                    const barColor = i === 0
                      ? `linear-gradient(90deg,${C.v},${C.vm})`
                      : i === 1
                      ? `linear-gradient(90deg,${C.v}99,${C.v}55)`
                      : `linear-gradient(90deg,${C.v}66,${C.v}33)`

                    return (
                      <div key={item.name} style={{
                        background: isTop
                          ? `linear-gradient(135deg,${C.card},${C.v}0a)`
                          : C.card,
                        border:`1px solid ${isTop ? C.v+"55" : C.br}`,
                        borderRadius:16,
                        padding:"14px 16px",
                        boxShadow: isTop ? `0 0 28px ${C.v}18, ${C.sh}` : C.sh,
                        position:"relative", overflow:"hidden",
                        transition:"border-color .2s"}}>

                        {/* glow fill proportional */}
                        <div style={{
                          position:"absolute", left:0, top:0, bottom:0,
                          width:`${pct}%`, pointerEvents:"none",
                          background:`linear-gradient(90deg,${C.v}0a 0%,transparent 100%)`,
                          borderRadius:"16px 0 0 16px"
                        }}/>

                        <div style={{position:"relative", display:"flex",
                          alignItems:"center", gap:12}}>

                          {/* rank badge */}
                          <div style={{
                            width:40, height:40, flexShrink:0,
                            borderRadius:12,
                            background: rk.bg,
                            border:`1px solid ${rk.border}`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize: m ? 20 : 12,
                            fontFamily:"'Space Grotesk',sans-serif",
                            fontWeight:700, color:rk.text,
                          }}>
                            {m || `#${i+1}`}
                          </div>

                          {/* info */}
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{display:"flex", alignItems:"baseline",
                              justifyContent:"space-between", gap:8, marginBottom:8}}>

                              <span style={{
                                fontFamily:"'DM Sans',sans-serif",
                                fontSize:14, fontWeight:600,
                                color: isTop ? C.tx : C.tx,
                                overflow:"hidden", textOverflow:"ellipsis",
                                whiteSpace:"nowrap", flex:1,
                              }}>
                                {item.name}
                              </span>

                              <span style={{
                                fontFamily:"'Space Grotesk',sans-serif",
                                fontSize:22, fontWeight:700, letterSpacing:-1,
                                color: isTop ? C.v : C.tx,
                                flexShrink:0, lineHeight:1,
                              }}>
                                {item.qty}
                                <span style={{
                                  fontFamily:"'DM Sans',sans-serif",
                                  fontSize:11, fontWeight:400,
                                  color:C.tx3, marginLeft:3, letterSpacing:0,
                                }}>uds</span>
                              </span>
                            </div>

                            {/* progress bar */}
                            <div style={{height:4, background:`${C.br}88`,
                              borderRadius:4, overflow:"hidden"}}>
                              <div style={{
                                height:"100%",
                                width:`${pct}%`,
                                background: barColor,
                                borderRadius:4,
                                boxShadow: isTop ? `0 0 8px ${C.v}88` : "none",
                              }}/>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* ── TOTAL ROW ── */}
                  <div style={{
                    marginTop:8,
                    background:`linear-gradient(135deg,${C.v}10,${C.vm}06)`,
                    border:`1px solid ${C.v}33`,
                    borderRadius:16, padding:"16px 20px",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    boxShadow:`0 0 20px ${C.v}10`,
                  }}>
                    <div>
                      <p style={{fontFamily:"'Space Grotesk',sans-serif",
                        fontSize:11, fontWeight:700, color:C.tx3,
                        letterSpacing:1, textTransform:"uppercase", marginBottom:2}}>
                        Total del día
                      </p>
                      <p style={{fontFamily:"'DM Sans',sans-serif",
                        fontSize:12, color:C.tx3}}>
                        {ranked.length} productos distintos
                      </p>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <span style={{fontFamily:"'Space Grotesk',sans-serif",
                        fontSize:32, fontWeight:700, color:C.v, letterSpacing:-1,
                        display:"block", lineHeight:1}}>
                        {totalUnits}
                      </span>
                      <span style={{fontFamily:"'DM Sans',sans-serif",
                        fontSize:11, color:C.tx3}}>unidades vendidas</span>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )
        })()}
      </div>

      {orderToPay && <PayModal total={orderToPay.total}
        onClose={()=>setOrderToPay(null)}
        onPay={payInfo=>confirmOrder(orderToPay,payInfo)}/>}
      {prodModal && <ProductModal p={prodModal.p}
        categories={[...new Set(activeProds.map(p=>p.category).filter(Boolean))].sort()}
        onClose={()=>setProdModal(null)} onSave={saveProd}/>}
      {payModal  && <PayModal total={cartFinal} onClose={()=>{ setPayModal(false) }} onPay={paySale}/>}
      {delModal  && <Del name={delModal.name} onYes={()=>delProd(delModal.id)} onNo={()=>setDelModal(null)}/>}
      {delSaleModal && (
        <Del
          name={`Venta #${sales.indexOf(delSaleModal)+1 > 0 ? sales.length - sales.indexOf(delSaleModal) : ""} — ${$(delSaleModal.total)}`}
          onYes={()=>delSale(delSaleModal.id)}
          onNo={()=>setDelSaleModal(null)}
        />
      )}
      {toastEl}
    </>
  )
}
