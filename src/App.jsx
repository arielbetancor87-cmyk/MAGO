import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, Timestamp
} from "firebase/firestore";
import { db } from "./lib/firebase.js";

const PLACEHOLDER = "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&q=80";
const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n||0);
const todayStr = () => new Date().toISOString().split("T")[0];
const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

const C = {
  bg:"#f5f4f9",surface:"#ffffff",surface2:"#faf9ff",
  border:"#e5e1f0",
  purple:"#6d28d9",purpleL:"#7c3aed",purpleXL:"#a78bfa",
  purpleBg:"#ede9fe",purpleHover:"#5b21b6",
  text:"#1e1433",text2:"#5b5370",text3:"#9490a5",
  green:"#059669",greenBg:"#d1fae5",
  blue:"#2563eb",blueBg:"#dbeafe",
  amber:"#d97706",amberBg:"#fef3c7",
  red:"#dc2626",redBg:"#fee2e2",
  shadow:"0 1px 4px #6d28d920",shadowM:"0 4px 20px #6d28d925",
};

function Spinner({size=20,color=C.purple}){
  return(<><style>{`@keyframes _sp{to{transform:rotate(360deg)}}`}</style><div style={{width:size,height:size,border:`3px solid ${color}33`,borderTop:`3px solid ${color}`,borderRadius:"50%",animation:"_sp 0.7s linear infinite",flexShrink:0}}/></>);
}

function Toast({msg,visible,isError}){
  return(<div style={{position:"fixed",bottom:28,left:"50%",transform:`translateX(-50%) translateY(${visible?0:14}px)`,opacity:visible?1:0,transition:"all 0.22s",background:isError?C.red:C.purple,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,letterSpacing:1,padding:"10px 24px",borderRadius:10,pointerEvents:"none",zIndex:9999,whiteSpace:"nowrap",boxShadow:"0 6px 28px #6d28d955"}}>{msg}</div>);
}

function ConfirmDialog({msg,onConfirm,onCancel}){
  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d922",backdropFilter:"blur(3px)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,maxWidth:340,width:"100%",textAlign:"center",boxShadow:C.shadowM}}>
        <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
        <p style={{color:C.text,fontSize:15,marginBottom:24,lineHeight:1.5}}>{msg}</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"10px 0",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text2,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,cursor:"pointer"}}>CANCELAR</button>
          <button onClick={onConfirm} style={{flex:1,padding:"10px 0",background:C.red,border:"none",borderRadius:8,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,cursor:"pointer"}}>ELIMINAR</button>
        </div>
      </div>
    </div>
  );
}

// ── compress image to base64 ───────────────────────────────────────────────
function compressImg(file){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=250,canvas=document.createElement("canvas");
        let w=img.width,h=img.height;
        if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}
        else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        const b64=canvas.toDataURL("image/jpeg",0.4);
        resolve(b64.length<400000?b64:"");
      };
      img.onerror=()=>resolve("");
      img.src=e.target.result;
    };
    reader.onerror=()=>resolve("");
    reader.readAsDataURL(file);
  });
}

// ── Product Modal ──────────────────────────────────────────────────────────
function ProductModal({product,onClose,onSave}){
  const isEdit=!!product?.id;
  const [name,setName]=useState(product?.name||"");
  const [price,setPrice]=useState(product?.price||"");
  const [imgUrl,setImgUrl]=useState(product?.img_url||"");
  const [imgPreview,setImgPreview]=useState(product?.img_url||"");
  const [imgB64,setImgB64]=useState(null);
  const [processing,setProcessing]=useState(false);
  const [err,setErr]=useState("");
  const fileRef=useRef();

  const handleFile=async(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    setImgPreview(URL.createObjectURL(file));
    setImgUrl("");setImgB64(null);setProcessing(true);
    const b64=await compressImg(file);
    setImgB64(b64||null);
    setProcessing(false);
  };

  const submit=()=>{
    if(!name.trim())return setErr("El nombre es requerido.");
    const p=parseFloat(price);
    if(!price||isNaN(p)||p<=0)return setErr("Precio inválido.");
    if(processing)return setErr("Esperá que termine de procesar la foto.");
    setErr("");
    onSave({name:name.trim(),price:p,img_url:imgB64||imgUrl.trim()||PLACEHOLDER,id:product?.id});
  };

  const inp={width:"100%",background:C.surface2,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box",transition:"border-color 0.2s"};

  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d920",backdropFilter:"blur(4px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:18,padding:28,width:"100%",maxWidth:440,position:"relative",boxShadow:C.shadowM,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:C.purpleBg,border:"none",color:C.purpleL,fontSize:18,width:30,height:30,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        <h2 style={{fontFamily:"'Barlow Condensed',sans-serif",color:C.purple,fontSize:22,fontWeight:900,letterSpacing:2,marginBottom:22,marginTop:0}}>{isEdit?"✏️ EDITAR":"➕ NUEVO PRODUCTO"}</h2>

        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:12,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>Nombre *</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Coca Cola 500ml" style={inp} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:12,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>Precio *</label>
          <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Ej: 1500" min={0} style={inp} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:12,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Foto del producto</label>
          {imgPreview&&(
            <div style={{position:"relative",marginBottom:12}}>
              <img src={imgPreview} alt="preview" style={{width:"100%",height:130,objectFit:"cover",borderRadius:10,border:`1.5px solid ${C.border}`}} onError={e=>{e.target.style.display="none";}}/>
              <button onClick={()=>{setImgPreview("");setImgB64(null);setImgUrl("");}} style={{position:"absolute",top:8,right:8,background:"#ffffffcc",border:"none",borderRadius:6,color:C.red,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
          )}
          <button onClick={()=>fileRef.current.click()} style={{width:"100%",padding:"11px 0",background:C.purpleBg,border:`1.5px dashed ${C.purpleXL}`,borderRadius:10,color:C.purple,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14,letterSpacing:1,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            📷 SUBIR FOTO
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{flex:1,height:1,background:C.border}}/>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,color:C.text3,letterSpacing:1}}>O PEGÁ UNA URL</span>
            <div style={{flex:1,height:1,background:C.border}}/>
          </div>
          <input type="text" value={imgUrl} onChange={e=>{setImgUrl(e.target.value);setImgB64(null);setImgPreview(e.target.value);}} placeholder="https://..." style={inp} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>

        {err&&<p style={{color:C.red,fontSize:13,marginBottom:12}}>{err}</p>}
        <button onClick={submit} disabled={processing} style={{width:"100%",background:processing?C.purpleXL:C.purple,color:"#fff",border:"none",borderRadius:10,padding:"13px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:17,letterSpacing:2,cursor:processing?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {processing&&<Spinner size={16} color="#fff"/>}
          {processing?"PROCESANDO...":isEdit?"GUARDAR CAMBIOS":"AGREGAR PRODUCTO"}
        </button>
      </div>
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────
function PaymentModal({total,onClose,onConfirm}){
  const [mode,setMode]=useState("efectivo");
  const [cashAmount,setCashAmount]=useState("");
  const [mpAmount,setMpAmount]=useState("");
  const cash=parseFloat(cashAmount)||0;
  const mp=parseFloat(mpAmount)||0;
  const change=mode==="efectivo"?Math.max(0,cash-total):mode==="mixto"?Math.max(0,cash-(total-mp)):0;
  const isValid=mode==="efectivo"?cash>=total:mode==="transferencia"?true:(mp+cash)>=total;
  const inp={width:"100%",background:C.surface2,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,padding:"12px 14px",fontSize:20,outline:"none",fontFamily:"'DM Mono',monospace",boxSizing:"border-box",transition:"border-color 0.2s"};
  const mBtn=(key,emoji,label)=>(<button onClick={()=>setMode(key)} style={{flex:1,padding:"11px 4px",borderRadius:10,background:mode===key?C.purple:C.surface2,color:mode===key?"#fff":C.text2,border:`1.5px solid ${mode===key?C.purple:C.border}`,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13,letterSpacing:1,cursor:"pointer",transition:"all 0.15s"}}>{emoji} {label}</button>);
  return(
    <div style={{position:"fixed",inset:0,background:"#6d28d922",backdropFilter:"blur(4px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:18,padding:28,width:"100%",maxWidth:460,position:"relative",boxShadow:C.shadowM}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:C.purpleBg,border:"none",color:C.purpleL,fontSize:18,width:30,height:30,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        <h2 style={{fontFamily:"'Barlow Condensed',sans-serif",color:C.purple,fontSize:24,fontWeight:900,letterSpacing:2,marginBottom:4,marginTop:0}}>COBRAR VENTA</h2>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:32,color:C.text,marginBottom:20,fontWeight:700}}>{fmt(total)}</div>
        <div style={{display:"flex",gap:8,marginBottom:22}}>{mBtn("efectivo","💵","EFECTIVO")}{mBtn("transferencia","📲","TRANSFER")}{mBtn("mixto","🔀","MIXTO")}</div>
        {(mode==="efectivo"||mode==="mixto")&&(<div style={{marginBottom:14}}><label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:12,letterSpacing:1,marginBottom:6}}>{mode==="mixto"?"MONTO EN EFECTIVO":"MONTO RECIBIDO"}</label><input type="number" value={cashAmount} onChange={e=>setCashAmount(e.target.value)} placeholder="0" style={inp} autoFocus onFocus={e=>e.target.style.borderColor=C.green} onBlur={e=>e.target.style.borderColor=C.border}/></div>)}
        {(mode==="transferencia"||mode==="mixto")&&(<div style={{marginBottom:14}}><label style={{display:"block",fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:12,letterSpacing:1,marginBottom:6}}>MONTO MERCADO PAGO / TRANSFER</label>{mode==="transferencia"?<div style={{padding:"12px 14px",background:C.blueBg,border:`1.5px solid ${C.blue}44`,borderRadius:8,fontFamily:"'DM Mono',monospace",color:C.blue,fontSize:20}}>{fmt(total)}</div>:<input type="number" value={mpAmount} onChange={e=>setMpAmount(e.target.value)} placeholder="0" style={inp} onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>}</div>)}
        {mode==="mixto"&&mp>0&&(<div style={{background:C.purpleBg,borderRadius:10,padding:"10px 16px",marginBottom:14}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,letterSpacing:2,color:C.text2,marginBottom:4}}>EFECTIVO REQUERIDO</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:22,color:C.purple}}>{fmt(Math.max(0,total-mp))}</div></div>)}
        {(mode==="efectivo"||mode==="mixto")&&cash>0&&(<div style={{background:change>0?C.greenBg:C.redBg,border:`1.5px solid ${change>0?C.green:C.red}44`,borderRadius:10,padding:"12px 16px",marginBottom:16}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,letterSpacing:2,color:C.text2,marginBottom:4}}>VUELTO</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:30,fontWeight:700,color:change>0?C.green:C.red}}>{fmt(change)}</div>{change<0&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:C.red,marginTop:4}}>MONTO INSUFICIENTE</div>}</div>)}
        <button onClick={()=>{if(isValid)onConfirm({method:mode,cash_paid:mode==="efectivo"||mode==="mixto"?cash:0,mp_paid:mode==="transferencia"?total:mode==="mixto"?mp:0,change_amount:change});}} disabled={!isValid}
          style={{width:"100%",background:isValid?C.purple:C.border,color:isValid?"#fff":C.text3,border:"none",borderRadius:10,padding:"14px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,letterSpacing:2,cursor:isValid?"pointer":"not-allowed"}}>
          CONFIRMAR
        </button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("caja");
  // LOCAL state — UI always instant
  const [products,setProducts]=useState([]);
  const [cart,setCart]=useState([]);
  const [sales,setSales]=useState([]);
  const [salesDate,setSalesDate]=useState(todayStr);
  const [loadingProds,setLoadingProds]=useState(true);
  const [loadingSales,setLoadingSales]=useState(false);
  const [syncing,setSyncing]=useState(false); // background sync indicator
  const [toast,setToast]=useState({msg:"",visible:false,isError:false});
  const [productModal,setProductModal]=useState(null);
  const [payModal,setPayModal]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [pressedId,setPressedId]=useState(null);
  const toastRef=useRef(null);
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);
  const [mobileView,setMobileView]=useState("products");

  useEffect(()=>{const h=()=>setIsMobile(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  const showToast=(msg,isError=false)=>{
    if(toastRef.current)clearTimeout(toastRef.current);
    setToast({msg,visible:true,isError});
    toastRef.current=setTimeout(()=>setToast(t=>({...t,visible:false})),2400);
  };

  // ── Load products from Firebase (background) ─────────────────────────────
  const loadProducts=useCallback(async()=>{
    try{
      const snap=await getDocs(collection(db,"products"));
      const list=snap.docs.map(d=>({id:d.id,...d.data()}));
      list.sort((a,b)=>(a.created_at?.seconds||0)-(b.created_at?.seconds||0));
      setProducts(list);
    }catch(e){console.error("loadProducts",e);}
    finally{setLoadingProds(false);}
  },[]);

  // ── Load sales by date ───────────────────────────────────────────────────
  const loadSales=useCallback(async(date)=>{
    setLoadingSales(true);
    try{
      const snap=await getDocs(query(collection(db,"sales"),where("date","==",date)));
      const list=snap.docs.map(d=>({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0));
      setSales(list);
    }catch(e){console.error("loadSales",e);}
    finally{setLoadingSales(false);}
  },[]);

  useEffect(()=>{loadProducts();},[]);
  useEffect(()=>{if(tab==="resumen")loadSales(salesDate);},[salesDate,tab]);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const addToCart=(p)=>{setCart(prev=>{const f=prev.find(i=>i.id===p.id);return f?prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...prev,{...p,qty:1}];});showToast(`${p.name} ✓`);};
  const changeQty=(id,d)=>setCart(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(0,i.qty+d)}:i).filter(i=>i.qty>0));
  const clearCart=()=>{setCart([]);};
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const totalItems=cart.reduce((s,i)=>s+i.qty,0);

  // ── Save product — LOCAL first, Firebase in background ──────────────────
  const saveProduct=(p)=>{
    if(p.id){
      // Update local immediately
      setProducts(prev=>prev.map(x=>x.id===p.id?{...x,...p}:x));
      setProductModal(null);
      showToast(`"${p.name}" actualizado`);
      // Firebase background
      setSyncing(true);
      updateDoc(doc(db,"products",p.id),{name:p.name,price:p.price,img_url:p.img_url})
        .catch(e=>console.error("update product",e))
        .finally(()=>setSyncing(false));
    }else{
      const tempId="temp_"+uid();
      const newProd={id:tempId,name:p.name,price:p.price,img_url:p.img_url,created_at:{seconds:Date.now()/1000}};
      setProducts(prev=>[...prev,newProd]);
      setProductModal(null);
      showToast(`"${p.name}" agregado`);
      // Firebase background — replace tempId with real id
      setSyncing(true);
      addDoc(collection(db,"products"),{name:p.name,price:p.price,img_url:p.img_url,created_at:Timestamp.now()})
        .then(ref=>{setProducts(prev=>prev.map(x=>x.id===tempId?{...x,id:ref.id}:x));})
        .catch(e=>console.error("add product",e))
        .finally(()=>setSyncing(false));
    }
  };

  // ── Delete product — LOCAL first ─────────────────────────────────────────
  const deleteProduct=(id)=>{
    setProducts(prev=>prev.filter(p=>p.id!==id));
    setCart(prev=>prev.filter(i=>i.id!==id));
    setConfirmDelete(null);
    showToast("Producto eliminado");
    if(!id.startsWith("temp_")){
      deleteDoc(doc(db,"products",id)).catch(e=>console.error("delete product",e));
    }
  };

  // ── Confirm sale — LOCAL first ───────────────────────────────────────────
  const confirmSale=(payInfo)=>{
    if(!cart.length)return;
    const today=todayStr();
    const saleObj={
      id:"temp_"+uid(),total,date:today,
      method:payInfo.method,cash_paid:payInfo.cash_paid,
      mp_paid:payInfo.mp_paid,change_amount:payInfo.change_amount,
      items:cart.map(i=>({product_id:i.id,product_name:i.name,product_price:i.price,qty:i.qty})),
      created_at:{seconds:Date.now()/1000,toDate:()=>new Date()},
    };
    // Update UI immediately
    if(salesDate===today)setSales(prev=>[saleObj,...prev]);
    setCart([]);setPayModal(false);
    showToast("✓ Venta registrada");
    if(isMobile)setMobileView("products");
    // Firebase background
    setSyncing(true);
    const{id:_,created_at:_ca,...fbData}=saleObj;
    addDoc(collection(db,"sales"),{...fbData,created_at:Timestamp.now()})
      .then(ref=>{setSales(prev=>prev.map(s=>s.id===saleObj.id?{...s,id:ref.id}:s));})
      .catch(e=>console.error("add sale",e))
      .finally(()=>setSyncing(false));
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const sumTotal=sales.reduce((s,v)=>s+v.total,0);
  const sumEfectivo=sales.reduce((s,v)=>s+(v.cash_paid||0),0);
  const sumMP=sales.reduce((s,v)=>s+(v.mp_paid||0),0);
  const sumItems=sales.reduce((s,v)=>s+(v.items||[]).reduce((a,i)=>a+i.qty,0),0);

  const methodLabel=(sale)=>{
    if(sale.method==="efectivo")return{label:"💵 EFECTIVO",color:C.green,bg:C.greenBg};
    if(sale.method==="transferencia")return{label:"📲 TRANSFER",color:C.blue,bg:C.blueBg};
    return{label:"🔀 MIXTO",color:C.amber,bg:C.amberBg};
  };

  const prevDay=()=>{const d=new Date(salesDate);d.setDate(d.getDate()-1);setSalesDate(d.toISOString().split("T")[0]);};
  const nextDay=()=>{const d=new Date(salesDate);d.setDate(d.getDate()+1);setSalesDate(d.toISOString().split("T")[0]);};
  const isToday=salesDate===todayStr();

  // ── Product Grid ───────────────────────────────────────────────────────────
  const ProductGrid=()=>(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,letterSpacing:3,color:C.text2}}>PRODUCTOS <span style={{color:C.text3,fontWeight:400,fontSize:16}}>({products.length})</span></span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {syncing&&<Spinner size={16}/>}
          <button onClick={()=>setProductModal({editing:null})} style={{background:C.purple,color:"#fff",border:"none",borderRadius:9,padding:"8px 20px",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14,letterSpacing:1.5,cursor:"pointer",boxShadow:`0 3px 12px ${C.purple}44`}}>+ AGREGAR</button>
        </div>
      </div>
      {loadingProds?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:80,gap:16,color:C.text3}}>
          <Spinner size={36}/><span style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:2,fontSize:14}}>CARGANDO...</span>
        </div>
      ):products.length===0?(
        <div style={{textAlign:"center",padding:60,color:C.text3}}>
          <div style={{fontSize:44,marginBottom:10}}>📦</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,letterSpacing:2}}>SIN PRODUCTOS<br/><span style={{fontWeight:400,fontSize:14}}>Usá "+ AGREGAR"</span></div>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:14}}>
          {products.map(p=>(
            <div key={p.id} style={{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:14,overflow:"hidden",position:"relative",cursor:"pointer",userSelect:"none",transform:pressedId===p.id?"scale(0.95)":"scale(1)",transition:"transform 0.08s",boxShadow:C.shadow}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.purpleL;e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="scale(1)";setPressedId(null);}}>
              <div style={{position:"absolute",top:7,right:7,display:"flex",gap:4,zIndex:10}}>
                <button onClick={e=>{e.stopPropagation();setProductModal({editing:p});}} style={{background:"#ffffffdd",backdropFilter:"blur(4px)",border:`1px solid ${C.border}`,borderRadius:7,color:C.purple,width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
                <button onClick={e=>{e.stopPropagation();setConfirmDelete(p);}} style={{background:"#ffffffdd",backdropFilter:"blur(4px)",border:`1px solid ${C.border}`,borderRadius:7,color:C.red,width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>
              </div>
              <div onClick={()=>{addToCart(p);setPressedId(p.id);setTimeout(()=>setPressedId(null),120);}}>
                <div style={{position:"relative",paddingTop:"70%",overflow:"hidden",background:C.purpleBg}}>
                  <img src={p.img_url||PLACEHOLDER} alt={p.name} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src=PLACEHOLDER;}}/>
                </div>
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4,lineHeight:1.3}}>{p.name}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700,color:C.purple}}>{fmt(p.price)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Cart Panel ─────────────────────────────────────────────────────────────
  const CartPanel=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:C.surface}}>
      <div style={{padding:"14px 16px 10px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:15,letterSpacing:2,color:C.text2}}>
          CARRITO {totalItems>0&&<span style={{marginLeft:8,background:C.purpleBg,color:C.purple,borderRadius:20,padding:"2px 9px",fontSize:13,fontWeight:700}}>{totalItems}</span>}
        </span>
        {cart.length>0&&<button onClick={clearCart} style={{background:C.redBg,border:`1px solid ${C.red}33`,borderRadius:7,color:C.red,padding:"5px 12px",cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,letterSpacing:1}}>VACIAR</button>}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"4px 0"}}>
        {cart.length===0?(
          <div style={{textAlign:"center",padding:"48px 20px",color:C.text3}}>
            <div style={{fontSize:44,marginBottom:10}}>🛒</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1,fontSize:14}}>TOCÁ UN PRODUCTO<br/>PARA AGREGAR</div>
          </div>
        ):cart.map(item=>(
          <div key={item.id} style={{display:"flex",alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`,gap:10}}>
            <img src={item.img_url||PLACEHOLDER} alt={item.name} style={{width:40,height:40,borderRadius:8,objectFit:"cover",flexShrink:0,border:`1px solid ${C.border}`}} onError={e=>{e.target.src=PLACEHOLDER;}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.purple,fontWeight:700}}>{fmt(item.price*item.qty)}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
              <button onClick={()=>changeQty(item.id,-1)} style={{width:30,height:30,background:C.surface2,border:`1.5px solid ${C.border}`,borderRadius:7,color:C.text2,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:C.text,minWidth:22,textAlign:"center",fontWeight:700}}>{item.qty}</span>
              <button onClick={()=>changeQty(item.id,1)} style={{width:30,height:30,background:C.purpleBg,border:`1.5px solid ${C.purpleXL}`,borderRadius:7,color:C.purple,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{borderTop:`1.5px solid ${C.border}`,padding:"16px 16px 18px",background:C.surface2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",color:C.text2,fontSize:14,letterSpacing:2}}>TOTAL</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:30,fontWeight:700,color:C.text}}>{fmt(total)}</span>
        </div>
        <button onClick={()=>{if(cart.length)setPayModal(true);else showToast("El carrito está vacío");}}
          style={{width:"100%",background:cart.length?C.purple:C.border,color:cart.length?"#fff":C.text3,border:"none",borderRadius:10,padding:"15px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,letterSpacing:2,cursor:cart.length?"pointer":"not-allowed",transition:"background 0.15s",boxShadow:cart.length?`0 4px 18px ${C.purple}55`:"none"}}>
          COBRAR
        </button>
      </div>
    </div>
  );

  return(
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>

        <header style={{background:C.surface,borderBottom:`1.5px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:66,position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px #6d28d914",gap:12}}>
          <img src="/logo.png" alt="MAGO Drinks" style={{height:50,objectFit:"contain"}}/>
          <div style={{display:"flex",gap:8}}>
            {[["caja","CAJA"],["resumen","HISTORIAL"]].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)} style={{background:tab===key?C.purple:C.purpleBg,color:tab===key?"#fff":C.purple,border:`1.5px solid ${tab===key?C.purple:C.purpleXL+"66"}`,borderRadius:9,padding:"8px 18px",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14,letterSpacing:1.5,cursor:"pointer",transition:"all 0.15s",boxShadow:tab===key?`0 3px 12px ${C.purple}44`:"none"}}>
                {label}
              </button>
            ))}
          </div>
        </header>

        {tab==="caja"&&(
          isMobile?(
            <div style={{height:"calc(100vh - 66px)",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",background:C.surface,borderBottom:`1.5px solid ${C.border}`}}>
                {[["products","PRODUCTOS"],["cart",`CARRITO (${totalItems})`]].map(([v,label])=>(
                  <button key={v} onClick={()=>setMobileView(v)} style={{flex:1,padding:"12px 0",background:"transparent",color:mobileView===v?C.purple:C.text3,border:"none",borderBottom:`3px solid ${mobileView===v?C.purple:"transparent"}`,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14,letterSpacing:1.5,cursor:"pointer"}}>{label}</button>
                ))}
              </div>
              <div style={{flex:1,overflow:"auto",padding:mobileView==="products"?16:0}}>
                {mobileView==="products"?<ProductGrid/>:<CartPanel/>}
              </div>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"1fr 320px",height:"calc(100vh - 66px)",overflow:"hidden"}}>
              <div style={{overflow:"auto",padding:"22px 24px",background:C.bg}}><ProductGrid/></div>
              <div style={{borderLeft:`1.5px solid ${C.border}`,overflow:"hidden"}}><CartPanel/></div>
            </div>
          )
        )}

        {tab==="resumen"&&(
          <div style={{maxWidth:900,margin:"0 auto",padding:"28px 20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
              <h2 style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:28,letterSpacing:3,color:C.purple,margin:0}}>HISTORIAL DE VENTAS</h2>
              <div style={{display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"6px 10px",boxShadow:C.shadow}}>
                <button onClick={prevDay} style={{background:C.purpleBg,border:"none",borderRadius:7,color:C.purple,width:32,height:32,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
                <input type="date" value={salesDate} onChange={e=>setSalesDate(e.target.value)} style={{background:"transparent",border:"none",color:C.text,fontFamily:"'DM Mono',monospace",fontSize:14,outline:"none",cursor:"pointer",minWidth:130,textAlign:"center"}}/>
                <button onClick={nextDay} disabled={isToday} style={{background:isToday?C.surface2:C.purpleBg,border:"none",borderRadius:7,color:isToday?C.text3:C.purple,width:32,height:32,cursor:isToday?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
                {!isToday&&<button onClick={()=>setSalesDate(todayStr())} style={{background:C.purple,border:"none",borderRadius:7,color:"#fff",padding:"0 10px",height:32,cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,letterSpacing:1}}>HOY</button>}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:28}}>
              {[
                {label:"TOTAL",val:fmt(sumTotal),accent:C.purple,bg:C.purpleBg},
                {label:"EFECTIVO",val:fmt(sumEfectivo),accent:C.green,bg:C.greenBg},
                {label:"TRANSFER / MP",val:fmt(sumMP),accent:C.blue,bg:C.blueBg},
                {label:"ARTÍCULOS",val:sumItems,accent:C.amber,bg:C.amberBg},
                {label:"VENTAS",val:sales.length,accent:C.purple,bg:C.purpleBg},
              ].map(({label,val,accent,bg})=>(
                <div key={label} style={{background:bg,border:`1.5px solid ${accent}33`,borderRadius:14,padding:"16px 18px",boxShadow:C.shadow}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,letterSpacing:2,color:C.text2,marginBottom:6}}>{label}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:24,color:accent}}>{val}</div>
                </div>
              ))}
            </div>

            {loadingSales?(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60,gap:14,color:C.text3}}>
                <Spinner size={28}/><span style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:2,fontSize:14}}>CARGANDO...</span>
              </div>
            ):sales.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:C.text3}}>
                <div style={{fontSize:48,marginBottom:12}}>📋</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,letterSpacing:2}}>SIN VENTAS ESTE DÍA</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sales.map((sale,idx)=>{
                  const m=methodLabel(sale);
                  const ts=sale.created_at?.toDate?sale.created_at.toDate():new Date(sale.created_at.seconds*1000);
                  return(
                    <div key={sale.id} style={{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:14,padding:"14px 18px",boxShadow:C.shadow}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.text3,background:C.surface2,padding:"2px 8px",borderRadius:6}}>#{sales.length-idx}</span>
                          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,letterSpacing:1.5,color:C.text3}}>{ts.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</span>
                          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,letterSpacing:1,padding:"3px 10px",borderRadius:6,background:m.bg,color:m.color}}>{m.label}</span>
                        </div>
                        <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:20,color:C.text}}>{fmt(sale.total)}</span>
                      </div>
                      <div style={{fontSize:13,color:C.text2,marginBottom:(sale.change_amount>0||sale.method==="mixto")?6:0}}>
                        {(sale.items||[]).map(i=>`${i.product_name} x${i.qty}`).join(" · ")}
                      </div>
                      {(sale.method==="mixto"||sale.change_amount>0)&&(
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
                          {sale.method==="mixto"&&<><span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.green,background:C.greenBg,padding:"2px 8px",borderRadius:6}}>💵 {fmt(sale.cash_paid)}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.blue,background:C.blueBg,padding:"2px 8px",borderRadius:6}}>📲 {fmt(sale.mp_paid)}</span></>}
                          {sale.change_amount>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.amber,background:C.amberBg,padding:"2px 8px",borderRadius:6}}>↩ Vuelto: {fmt(sale.change_amount)}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {payModal&&<PaymentModal total={total} onClose={()=>setPayModal(false)} onConfirm={confirmSale}/>}
      {productModal&&<ProductModal product={productModal.editing} onClose={()=>setProductModal(null)} onSave={saveProduct}/>}
      {confirmDelete&&<ConfirmDialog msg={`¿Eliminar "${confirmDelete.name}"?`} onConfirm={()=>deleteProduct(confirmDelete.id)} onCancel={()=>setConfirmDelete(null)}/>}
      <Toast msg={toast.msg} visible={toast.visible} isError={toast.isError}/>
    </>
  );
}
