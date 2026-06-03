"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, doc, onSnapshot, addDoc } from "firebase/firestore"
import Image from "next/image"
import { gerarPixCopiaECola } from "@/lib/pix"

const PRECOS_PRODUTOS: { [key: string]: number } = {
  tapiocaMolhada: 8.00,
  tapiocaManteiga: 6.00,
  tapiocaQueijo: 8.00,
  cuscuzMilho: 5.00,
  cuscuzArroz: 6.00,
  cuscuzMilhoArroz: 6.00,
  cafe: 4.00
}

const DETALHES_PRODUTOS: { [key: string]: { nome: string; icone: string } } = {
  tapiocaMolhada: { nome: "Tapioca Molhada", icone: "🥥" },
  tapiocaManteiga: { nome: "Tapioca com Manteiga", icone: "🧈" },
  tapiocaQueijo: { nome: "Tapioca com Queijo", icone: "🧀" },
  cuscuzMilho: { nome: "Cuszuz de Milho", icone: "🌽" },
  cuscuzArroz: { nome: "Cuscuz de Arroz", icone: "🍚" },
  cuscuzMilhoArroz: { nome: "Cuscuz Milho e Arroz (Misto)", icone: "🎛️" },
  cafe: { nome: "Café Quentinho", icone: "☕" }
}

const OPCOES_HORARIOS = [
  "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00",
  "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"
]

export default function ClientePainel() {
  const [lojaAberta, setLojaAberta] = useState<boolean>(true)
  const [carregandoLoja, setCarregandoLoja] = useState(true)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [etapa, setEtapa] = useState<"menu" | "checkout" | "confirmacao" | "sucesso">("menu")

  const [nome, setNome] = useState("")
  const [endereco, setEndereco] = useState("")
  const [numeroCasa, setNumeroCasa] = useState("")
  const [referencia, setReferencia] = useState("")
  const [pagamento, setPagamento] = useState<"Pix" | "Dinheiro">("Pix")
  const [trocoPara, setTrocoPara] = useState("")
  const [horario, setHorario] = useState("05:30")
  const [mostrarListaHorarios, setMostrarListaHorarios] = useState(false)

  // ESTADO DO PIX COM RETORNO DE ERRO TRATADO
  const [statusPix, setStatusPix] = useState<"normal" | "carregando" | "copiado" | "erro">("normal")

  const [itens, setItens] = useState<{ [key: string]: number }>({
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cuscuzMilhoArroz: 0,
    cafe: 0,
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      setNome(localStorage.getItem("tapicuz_nome") || "")
      setEndereco(localStorage.getItem("tapicuz_endereco") || "")
      setNumeroCasa(localStorage.getItem("tapicuz_numero") || "")
      setReferencia(localStorage.getItem("tapicuz_referencia") || "")
    }

    const refLoja = doc(db, "configuracoes", "loja")
    const unsubscribe = onSnapshot(refLoja, (snap) => {
      if (snap.exists()) {
        setLojaAberta(snap.data().aberta)
      }
      setCarregandoLoja(false)
    }, (error) => {
      console.error("Erro ao carregar status da loja:", error)
      setCarregandoLoja(false)
    })
    return () => unsubscribe()
  }, [])

  function alterarQtd(chave: string, valor: number) {
    setItens(prev => ({
      ...prev,
      [chave]: Math.max(0, prev[chave] + valor)
    }))
  }

  const totalItensSelecionados = Object.values(itens).reduce((a, b) => a + b, 0)
  
  let subtotal = 0
  let qtdComidas = 0
  let qtdCafes = itens.cafe

  Object.entries(itens).forEach(([key, qtd]) => {
    subtotal += (PRECOS_PRODUTOS[key] || 0) * qtd
    if (key !== "cafe") qtdComidas += qtd
  })

  let descuentoCombo = 0
  if (qtdComidas > 0 && qtdCafes > 0) {
    const totalCombosPossiveis = Math.min(qtdComidas, qtdCafes)
    let cafesAplicados = 0

    Object.entries(itens).forEach(([key, qtd]) => {
      if (key !== "cafe" && qtd > 0) {
        const comidasNoCombo = Math.min(qtd, totalCombosPossiveis - cafesAplicados)
        if (comidasNoCombo > 0) {
          const valorNormalPar = PRECOS_PRODUTOS[key] + PRECOS_PRODUTOS.cafe
          const descuentoPorPar = valorNormalPar - 10.00
          descuentoCombo += descuentoPorPar * comidasNoCombo
          cafesAplicados += comidasNoCombo
        }
      }
    })
  }

  const valorTotalFinal = Math.max(0, subtotal - descuentoCombo)
  const trocoParaNum = parseFloat(trocoPara.replace(",", ".")) || 0
  const trocoCalculado = pagamento === "Dinheiro" && trocoParaNum > valorTotalFinal ? trocoParaNum - valorTotalFinal : 0

  function irParaConferencia(e: any) {
    e.preventDefault()
    if (!nome.trim() || valorTotalFinal === 0 || !lojaAberta) return
    setEtapa("confirmacao")
  }

  async function enviarPedidoFinal() {
    if (enviandoPedido) return
    setEnviandoPedido(true)

    if (typeof window !== "undefined") {
      localStorage.setItem("tapicuz_nome", nome.trim())
      localStorage.setItem("tapicuz_endereco", endereco.trim())
      localStorage.setItem("tapicuz_numero", numeroCasa.trim())
      localStorage.setItem("tapicuz_referencia", referencia.trim())
    }

    const enderecoCompleto = endereco.trim() 
      ? `${endereco.trim()}, Nº ${numeroCasa.trim()} ${referencia.trim() ? `- Ref: ${referencia.trim()}` : ""}`
      : "Retirada no Balcão"

    const payloadPedido = {
      nome: nome.trim(),
      endereco: enderecoCompleto,
      pagamento,
      troco: trocoCalculado,
      valorTotal: valorTotalFinal,
      horario,
      pago: pagamento === "Pix",
      concluido: false,
      dataCriacao: new Date().toISOString(),
      itens
    }

    try {
      await addDoc(collection(db, "pedidos"), payloadPedido)
      setEtapa("sucesso")
    } catch (error) {
      console.error(error)
      alert("Houve um erro ao processar o envio. Tente novamente.")
    } finally {
      setEnviandoPedido(false)
    }
  }

  function reiniciarPainel() {
    setItens({ tapiocaMolhada: 0, tapiocaManteiga: 0, tapiocaQueijo: 0, cuscuzMilho: 0, cuscuzArroz: 0, cuscuzMilhoArroz: 0, cafe: 0 })
    setTrocoPara("")
    setEtapa("menu")
  }

  if (carregandoLoja) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center text-zinc-500 text-xs tracking-widest font-bold animate-pulse">
        CARREGANDO CARDÁPIO...
      </div>
    )
  }

  if (!lojaAberta) {
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-center mb-8 select-none">
          <h1 className="text-3xl font-black text-orange-500 tracking-widest uppercase">TAPICUZ</h1>
          <p className="text-xs font-bold text-amber-500/80 tracking-widest uppercase mt-0.5">Cardápio</p>
        </div>
        <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 p-8 rounded-3xl shadow-2xl space-y-4">
          <div className="text-4xl animate-pulse">🌙</div>
          <h2 className="text-lg font-black uppercase text-orange-500 tracking-wider">
            Ficamos felizes com sua visita!
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            No momento nosso painel de pedidos está descansando. Volte em breve para saborear o melhor café da manhã do Nordeste!
          </p>
        </div>
      </div>
    )
  }

  if (etapa === "sucesso") {
    const mensagemWhats = encodeURIComponent(
      `Olá! Acabei de fazer um pedido pelo painel.\n👤 *Cliente:* ${nome}\n💰 *Valor:* R$ ${valorTotalFinal.toFixed(2)}\n\nSegue em anexo o meu comprovante Pix! 👇`
    );
    // Insira o número do WhatsApp da loja aqui (apenas números com DDD)
    const numeroWhatsAppLoja = "5581999999999"; 

    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner animate-bounce">
            ✓
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-emerald-400 tracking-wider uppercase">
              PEDIDO ENVIADO COM SUCESSO!
            </h2>
            <p className="text-xs text-zinc-400 px-4">
              Sua encomenda já chegou no nosso sistema e foi direto para a produção!
            </p>
          </div>

          {/* SESSÃO CRIATIVA DE COMPROVANTE APENAS SE FOR PAGAMENTO VIA PIX */}
          {pagamento === "Pix" && (
            <div className="bg-zinc-900/90 border border-teal-500/30 p-5 rounded-2xl space-y-3 text-center my-2">
              <span className="text-2xl block animate-pulse">📲</span>
              <h3 className="text-xs font-black text-teal-400 uppercase tracking-widest">Falta muito pouco!</h3>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Para darmos prioridade máxima no seu preparo, clique abaixo para nos enviar o comprovante do Pix.
              </p>
              <a
                href={`https://wa.me/${numeroWhatsAppLoja}?text=${mensagemWhats}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
              >
                <span>💬 ENVIAR COMPROVANTE</span>
              </a>
            </div>
          )}

          <button 
            onClick={reiniciarPainel}
            className="w-full py-3.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-black text-xs uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all"
          >
            VOLTAR PARA O INÍCIO
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-zinc-200 pb-32 font-sans antialiased selection:bg-orange-500/20">
      
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60 px-4 py-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-center relative">
          <div className="text-center select-none">
            <h1 className="text-2xl font-black text-orange-500 tracking-widest uppercase">TAPICUZ</h1>
            <p className="text-xs font-bold text-amber-500/80 tracking-[0.2em] uppercase mt-0.5">Cardápio</p>
          </div>
          <div className="absolute right-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Aberto
          </div>
        </div>
      </header>

      {(etapa === "menu" || etapa === "checkout") && (
        <div className="max-w-2xl mx-auto w-full px-0 sm:px-4">
          <div className="w-full overflow-hidden rounded-b-3xl shadow-lg border-b border-zinc-800/50 block">
            <Image
              src="/banner/banner-topo.png"
              alt="Tapicuz Café da Manhã"
              width={800}
              height={220}
              priority
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      )}

      {etapa === "menu" && (
        <div className="max-w-2xl mx-auto px-4 mt-6 space-y-4">
          <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-lg">🔥</span>
            <div className="text-xs">
              <h4 className="font-black text-orange-400 uppercase tracking-wide">Combo Ativo!</h4>
              <p className="text-zinc-400 font-medium">Monte qualquer par de <strong>Comida + Café</strong> por apenas <strong className="text-emerald-400 font-bold">R$ 10,00</strong>.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {Object.keys(DETALHES_PRODUTOS).map((chave) => {
              const produto = DETALHES_PRODUTOS[chave]
              const preco = PRECOS_PRODUTOS[chave]
              const quantidade = itens[chave] || 0
              const ehPrimeiroItem = chave === "tapiocaMolhada"

              return (
                <div 
                  key={chave} 
                  className={`border rounded-3xl p-6 flex flex-col items-center gap-5 transition-all bg-zinc-950 ${quantidade > 0 ? "border-orange-500/50 bg-orange-950/10 shadow-lg" : "border-zinc-800/80"}`}
                >
                  <div className="w-full flex justify-center mb-3">
                    <Image
                      src={`/produtos/${
                        chave === "tapiocaMolhada"
                          ? "tapioca_molhada.png"
                          : chave === "tapiocaManteiga"
                          ? "tapioca_manteiga.png"
                          : chave === "tapiocaQueijo"
                          ? "tapioca_queijo.png"
                          : chave === "cuscuzMilho"
                          ? "cuscuz_milho.png"
                          : chave === "cuscuzArroz"
                          ? "cuscuz_arroz.png"
                          : chave === "cuscuzMilhoArroz"
                          ? "cuscuz_milho_arroz.png"
                          : "cafe_leite.png"
                      }`}
                      alt={produto.nome}
                      width={112}
                      height={112}
                      className="w-28 h-28 object-cover aspect-square rounded-2xl border-2 border-zinc-800 shadow-md"
                      loading={ehPrimeiroItem ? "eager" : "lazy"}
                      priority={ehPrimeiroItem}
                    />
                  </div>

                  <div className="text-center">
                    <h3 className="font-bold text-zinc-100 text-xl tracking-wide uppercase">{produto.nome}</h3>
                    <span className="text-emerald-400 font-black text-lg block mt-1">R$ {preco.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5 gap-2 w-full max-w-[200px] justify-center">
                    {quantidade > 0 && (
                      <>
                        <button 
                          type="button" 
                          onClick={() => alterarQtd(chave, -1)} 
                          className="w-12 h-12 rounded-xl bg-zinc-950 text-zinc-400 hover:text-zinc-200 shadow-sm active:scale-90 font-black text-lg transition-all"
                        >
                          -
                        </button>
                        <span className="font-black text-zinc-200 text-xl w-10 text-center">{quantidade}</span>
                      </>
                    )}
                    <button 
                      type="button" 
                      onClick={() => alterarQtd(chave, 1)} 
                      className={`h-12 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center ${quantidade > 0 ? "w-12 bg-orange-500 text-white text-lg" : "w-full px-6 bg-zinc-950 text-zinc-300 border border-zinc-800 text-sm uppercase tracking-widest"}`}
                    >
                      {quantidade > 0 ? "+" : "Adicionar"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {etapa === "checkout" && (
        <div className="max-w-md mx-auto px-4 mt-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <button type="button" onClick={() => setEtapa("menu")} className="text-zinc-400 hover:text-zinc-200 font-bold text-xs bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-xl shadow-sm">← Voltar</button>
            <h2 className="text-xs font-black uppercase text-orange-500 tracking-wider ml-auto">Informações de Entrega</h2>
          </div>

          <form onSubmit={irParaConferencia} className="space-y-3 text-[11px]">
            <div className="bg-zinc-950 border border-zinc-800/80 p-4 rounded-2xl space-y-3 shadow-md">
              <div>
                <label className="text-xs font-black text-orange-400 uppercase block mb-1">Seu Nome *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ex: Maria Souza" 
                  value={nome} 
                  onChange={(e) => setNome(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-3.5 text-sm text-zinc-100 outline-none transition-all" 
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-black text-orange-400 uppercase block mb-1">Endereço de Entrega</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Rua das Flores" 
                    value={endereco} 
                    onChange={(e) => setEndereco(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-3.5 text-sm text-zinc-100 outline-none transition-all" 
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-orange-400 uppercase block mb-1">Número</label>
                  <input 
                    type="number"
                    inputMode="numeric"
                    placeholder="123" 
                    value={numeroCasa} 
                    onChange={(e) => setNumeroCasa(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-3.5 text-sm font-black text-center text-zinc-100 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-orange-400 uppercase block mb-1">Ponto de Referência</label>
                <input 
                  type="text" 
                  placeholder="Ex: Próximo ao mercado" 
                  value={referencia} 
                  onChange={(e) => setReferencia(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-400 rounded-xl p-3.5 text-sm text-zinc-100 outline-none transition-all" 
                />
              </div>

              <div className="text-center pt-1 border-t border-zinc-800/50 mt-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase block mb-1.5">
                  🕒 Escolha o horário da entrega
                </label>
                
                <button
                  type="button"
                  onClick={() => setMostrarListaHorarios(!mostrarListaHorarios)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 flex items-center justify-center relative active:scale-95 transition-all"
                >
                  <span className="text-orange-500 font-black text-xl tracking-wide">{horario}</span>
                  <span className="text-zinc-600 absolute right-4 text-xs">{mostrarListaHorarios ? "▲" : "▼"}</span>
                </button>

                {mostrarListaHorarios && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-2 bg-zinc-900 border border-orange-500/30 rounded-xl shadow-inner">
                    {OPCOES_HORARIOS.map((hora) => (
                      <button
                        key={hora}
                        type="button"
                        onClick={() => {
                          setHorario(hora)
                          setMostrarListaHorarios(false)
                        }}
                        className={`py-3 text-center rounded-lg font-bold text-xs transition-all ${
                          horario === hora 
                            ? "bg-orange-500 text-white font-black shadow-lg" 
                            : "bg-zinc-950 text-zinc-400 border border-zinc-800"
                        }`}
                      >
                        {hora}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-4 rounded-2xl space-y-3 shadow-md">
              <div>
                <label className="text-xs font-black text-orange-400 uppercase block mb-1">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    onClick={() => setPagamento("Pix")}
                    className={`p-3.5 rounded-xl border text-sm font-black text-center uppercase tracking-wider transition-all ${pagamento === "Pix" ? "bg-teal-500/10 border-teal-500 text-teal-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}
                  >
                    📲 PIX
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPagamento("Dinheiro")}
                    className={`p-3.5 rounded-xl border text-sm font-black text-center uppercase tracking-wider transition-all ${pagamento === "Dinheiro" ? "bg-orange-500/10 border-orange-500 text-orange-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}
                  >
                    💵 DINHEIRO
                  </button>
                </div>
              </div>

              {pagamento === "Pix" && (
                <div className="space-y-3 pt-2">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    
                    <p className="text-orange-400 font-black text-xs uppercase tracking-wider">
                      Total a pagar no PIX
                    </p>
                    <p className="text-3xl font-black text-emerald-400 mt-2 tracking-tight">
                      R$ {valorTotalFinal.toFixed(2)}
                    </p>
                    
                    {/* BOTÃO ULTRA-ESTÁVEL (NÃO TRAVA E EVITA QUEDA DO SERVIDOR) */}
                    <button
                      type="button"
                      disabled={statusPix === "carregando"}
                      onClick={async () => {
                        try {
                          setStatusPix("carregando");

                          // 1. Executa a função assíncrona do payload fora do fluxo do DOM
                          const dadosPix = await gerarPixCopiaECola(valorTotalFinal);
                          
                          if (!dadosPix || !dadosPix.payload) {
                            throw new Error("Payload inválido");
                          }

                          // 2. Criação estruturada de input para evitar congelamento no mobile
                          const inputInvisivel = document.createElement("input");
                          inputInvisivel.value = dadosPix.payload;
                          inputInvisivel.style.position = "absolute";
                          inputInvisivel.style.left = "-9999px";
                          document.body.appendChild(inputInvisivel);
                          inputInvisivel.select();
                          inputInvisivel.setSelectionRange(0, 99999);
                          
                          document.execCommand("copy");
                          document.body.removeChild(inputInvisivel);

                          setStatusPix("copiado");
                          setTimeout(() => setStatusPix("normal"), 3000);

                        } catch (error) {
                          console.error("Erro no fluxo do PIX:", error);
                          setStatusPix("erro");
                          setTimeout(() => setStatusPix("normal"), 4000);
                        }
                      }}
                      className={`mt-4 w-full font-black py-4 rounded-xl active:scale-95 transition-all text-xs tracking-widest uppercase text-white shadow-md
                        ${statusPix === "normal" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                        ${statusPix === "carregando" ? "bg-zinc-700 cursor-not-allowed animate-pulse" : ""}
                        ${statusPix === "copiado" ? "bg-blue-600" : ""}
                        ${statusPix === "erro" ? "bg-red-600" : ""}
                      `}
                    >
                      {statusPix === "normal" && "📋 COPIAR PIX AUTOMÁTICO"}
                      {statusPix === "carregando" && "⌛ GERANDO PIX..."}
                      {statusPix === "copiado" && "✅ COPIADO COM SUCESSO!"}
                      {statusPix === "erro" && "❌ ERRO. CLIQUE PARA TENTAR NOVO"}
                    </button>
                  </div>
                </div>
              )}

              {pagamento === "Dinheiro" && (
                <div className="space-y-1 pt-0.5">
                  <label className="text-xs font-black text-orange-400 uppercase block mb-1">Precisa de troco para quanto?</label>
                  <input 
                    type="number"
                    inputMode="decimal"
                    placeholder="50" 
                    value={trocoPara} 
                    onChange={(e) => setTrocoPara(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-400 rounded-xl p-3.5 text-sm text-zinc-100 font-bold outline-none transition-all" 
                  />
                  {trocoCalculado > 0 && (
                    <p className="text-xs text-emerald-400 font-bold pt-0.5">Seu troco será de: R$ {trocoCalculado.toFixed(2)}</p>
                  )}
                </div>
              )}
            </div>

            <button 
              type="submit" 
              className="w-full py-4 bg-orange-500 text-white text-base font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
            >
              Conferir Pedido →
            </button>
          </form>
        </div>
      )}

      {etapa === "confirmacao" && (
        <div className="max-w-md mx-auto px-4 mt-6 space-y-5 text-base">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <button type="button" onClick={() => setEtapa("checkout")} className="text-zinc-400 hover:text-zinc-200 font-black text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-xl shadow-sm">← Alterar Dados</button>
            <h2 className="text-sm font-black uppercase text-orange-500 tracking-wider ml-auto">Conferir Pedido</h2>
          </div>

          <div className="bg-zinc-950 border-2 border-orange-500/60 rounded-[32px] p-6 space-y-5 shadow-2xl">
            
            <div className="space-y-3 text-zinc-200 border-b-2 border-zinc-900 pb-4 text-sm leading-relaxed">
              <p><strong className="text-zinc-500 block text-xs uppercase tracking-wider">Cliente:</strong> <span className="text-zinc-100 font-bold text-base">{nome}</span></p>
              <p><strong className="text-zinc-500 block text-xs uppercase tracking-wider">Endereço de Entrega:</strong> <span className="text-zinc-100 font-semibold">{endereco.trim() ? `${endereco.trim()}, Nº ${numeroCasa.trim()} ${referencia.trim() ? `(${referencia.trim()})` : ""}` : "Retirada no Balcão"}</span></p>
              
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900">
                <div>
                  <strong className="text-zinc-500 block text-[10px] uppercase tracking-wider">Horário Marcado:</strong> 
                  <span className="text-orange-500 font-black font-mono text-xl block mt-0.5">{horario}</span>
                </div>
                <div>
                  <strong className="text-zinc-500 block text-[10px] uppercase tracking-wider">Forma de Pagamento:</strong> 
                  <span className="text-zinc-100 font-black uppercase text-sm block mt-1">{pagamento}</span>
                </div>
              </div>

              {pagamento === "Dinheiro" && trocoCalculado > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl mt-2 text-emerald-400 text-xs font-bold">
                  Troco para: R$ {parseFloat(trocoPara).toFixed(2)} (Leva R$ {trocoCalculado.toFixed(2)} de troco)
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <span className="text-[11px] uppercase font-black text-zinc-500 block tracking-wider">Itens Escolhidos:</span>
              {Object.entries(itens).map(([chave, qtd]) => {
                if (qtd === 0) return null
                const produto = DETALHES_PRODUTOS[chave]
                const precoUnidade = PRECOS_PRODUTOS[chave]
                return (
                  <div key={chave} className="flex justify-between items-center text-zinc-100 text-sm py-0.5">
                    <span className="font-bold flex items-center gap-2">
                      <span className="text-base">{produto.icone}</span> 
                      <span className="text-orange-400 font-black text-base">{qtd}x</span> 
                      {produto.nome}
                    </span>
                    <span className="font-black text-zinc-300 font-mono">R$ {(precoUnidade * qtd).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            <div className="border-t-2 border-zinc-900 pt-4 space-y-2">
              {descuentoCombo > 0 && (
                <div className="flex justify-between text-emerald-400 font-black text-xs uppercase bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10">
                  <span>Desconto Combo Ativo:</span>
                  <span>- R$ {descuentoCombo.toFixed(2)}</span>
                </div>
              )}
              <div className="flex flex-col items-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 mt-2 text-center">
                <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">VALOR TOTAL DO PEDIDO</span>
                <span className="text-emerald-400 text-3xl font-black font-mono tracking-tight mt-1">R$ {valorTotalFinal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button 
            type="button"
            disabled={enviandoPedido}
            onClick={enviarPedidoFinal}
            className="w-full py-5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-lg font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-950/40 active:scale-95"
          >
            {enviandoPedido ? "Enviando para Cozinha..." : "🚀 ENVIAR PEDIDO AGORA"}
          </button>
        </div>
      )}

      {totalItensSelecionados > 0 && (etapa === "menu" || etapa === "checkout") && (
        <div className="fixed bottom-6 left-4 right-4 z-40 max-w-xl mx-auto">
          <div className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
            <div>
              <span className="bg-orange-500/20 text-orange-400 font-black text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                {totalItensSelecionados} {totalItensSelecionados === 1 ? "Item" : "Itens"}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-black text-emerald-400 tracking-tight">R$ {valorTotalFinal.toFixed(2)}</span>
              </div>
            </div>

            {etapa === "menu" ? (
              <button 
                type="button" 
                onClick={() => setEtapa("checkout")}
                className="bg-orange-500 text-white text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                Avançar →
              </button>
            ) : (
              <button 
                type="button" 
                onClick={() => setEtapa("menu")}
                className="bg-zinc-900 text-zinc-300 text-xs font-black uppercase tracking-wide px-5 py-3.5 rounded-xl transition-all active:scale-95"
              >
                ← Cardápio
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}