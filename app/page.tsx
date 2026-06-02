"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, doc, onSnapshot, addDoc } from "firebase/firestore"
import Image from "next/image"

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
  cuscuzMilho: { nome: "Cuscuz de Milho", icone: "🌽" },
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
  const [etapa, setEtapa] = useState<"menu" | "checkout" | "sucesso">("menu")

  const [nome, setNome] = useState("")
  const [endereco, setEndereco] = useState("")
  const [numeroCasa, setNumeroCasa] = useState("")
  const [referencia, setReferencia] = useState("")
  const [pagamento, setPagamento] = useState<"Pix" | "Dinheiro">("Pix")
  const [trocoPara, setTrocoPara] = useState("")
  const [horario, setHorario] = useState("07:00")

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
          const descontoPorPar = valorNormalPar - 10.00
          descuentoCombo += descontoPorPar * comidasNoCombo
          cafesAplicados += comidasNoCombo
        }
      }
    })
  }

  const valorTotalFinal = Math.max(0, subtotal - descuentoCombo)
  const trocoParaNum = parseFloat(trocoPara.replace(",", ".")) || 0
  const trocoCalculado = pagamento === "Dinheiro" && trocoParaNum > valorTotalFinal ? trocoParaNum - valorTotalFinal : 0

  async function finalizarPedidoCliente(e: any) {
    e.preventDefault()
    if (!nome.trim() || valorTotalFinal === 0 || !lojaAberta || enviandoPedido) return
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
      setItens({ tapiocaMolhada: 0, tapiocaManteiga: 0, tapiocaQueijo: 0, cuscuzMilho: 0, cuscuzArroz: 0, cuscuzMilhoArroz: 0, cafe: 0 })
      setTrocoPara("")
      setEtapa("sucesso")
    } catch (error) {
      console.error(error)
      alert("Houve um erro ao processar o envio. Tente novamente.")
    } finally {
      setEnviandoPedido(false)
    }
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
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md w-full bg-emerald-950/40 border border-emerald-500/30 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
            ✓
          </div>
          <h2 className="text-xl font-black text-emerald-400 tracking-wider uppercase">
            PEDIDO REALIZADO COM SUCESSO!
          </h2>
          <button 
            onClick={() => setEtapa("menu")}
            className="w-full py-3.5 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
          >
            Fazer outro pedido
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

      {etapa === "menu" && (
        <div className="max-w-2xl mx-auto px-4 mt-6 space-y-4">
          <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-lg">🔥</span>
            <div className="text-xs">
              <h4 className="font-black text-orange-400 uppercase tracking-wide">Combo Ativo!</h4>
              <p className="text-zinc-400 font-medium">Monte qualquer par de <strong>Comida + Café</strong> por apenas <strong className="text-emerald-400 font-bold">R$ 10,00</strong>.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {Object.keys(DETALHES_PRODUTOS).map((chave) => {
              const produto = DETALHES_PRODUTOS[chave]
              const preco = PRECOS_PRODUTOS[chave]
              const quantidade = itens[chave] || 0

              return (
                <div 
                  key={chave} 
                  className={`border rounded-3xl p-5 flex items-center justify-between gap-4 transition-all bg-zinc-950 ${quantidade > 0 ? "border-orange-500/50 bg-orange-950/10 shadow-lg" : "border-zinc-800/80"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-24 relative rounded-xl overflow-hidden">
                      <Image
                        src={`/produtos/${chave === "tapiocaMolhada"
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
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-100 text-lg tracking-wide uppercase">{produto.nome}</h3>
                      <span className="text-emerald-400 font-black text-base block mt-0.5">R$ {preco.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
                    {quantidade > 0 && (
                      <>
                        <button 
                          type="button" 
                          onClick={() => alterarQtd(chave, -1)} 
                          className="w-12 h-12 rounded-lg bg-zinc-950 text-zinc-400 hover:text-zinc-200 shadow-sm active:scale-90 font-black text-sm transition-all"
                        >
                          -
                        </button>
                        <span className="font-black text-zinc-200 text-lg w-8 text-center">{quantidade}</span>
                      </>
                    )}
                    <button 
                      type="button" 
                      onClick={() => alterarQtd(chave, 1)} 
                      className={`h-12 rounded-lg font-black text-xs transition-all active:scale-95 flex items-center justify-center ${quantidade > 0 ? "w-12 bg-orange-500 text-white font-black text-sm" : "px-4 bg-zinc-950 text-zinc-300 border border-zinc-800 hover:bg-zinc-900"}`}
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
            <h2 className="text-xs font-black uppercase text-orange-500 tracking-wider ml-auto">Finalizar Pedido</h2>
          </div>

          <form onSubmit={finalizarPedidoCliente} className="space-y-4 text-xs">
            <div className="bg-zinc-950 border border-zinc-800/80 p-5 rounded-2xl space-y-4 shadow-md">
              <div>
                <label className="text-base font-black text-orange-400 uppercase block mb-2">Seu Nome *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ex: Maria Souza" 
                  value={nome} 
                  onChange={(e) => setNome(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-5 text-lg text-zinc-100 outline-none transition-all" 
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-base font-black text-orange-400 uppercase block mb-2">Endereço de Entrega</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Rua das Flores" 
                    value={endereco} 
                    onChange={(e) => setEndereco(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-5 text-lg text-zinc-100 outline-none transition-all" 
                  />
                </div>
                <div>
                  <label className="text-base font-black text-orange-400 uppercase block mb-2">Número</label>
                  <input 
                    type="number"
                    inputMode="numeric"
                    placeholder="123" 
                    value={numeroCasa} 
                    onChange={(e) => setNumeroCasa(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-5 text-xl font-black text-center text-zinc-100 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="text-base font-black text-orange-400 uppercase block mb-2">Ponto de Referência</label>
                <input 
                  type="text" 
                  placeholder="Ex: Próximo ao mercado" 
                  value={referencia} 
                  onChange={(e) => setReferencia(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-5 text-lg text-zinc-100 outline-none transition-all" 
                />
              </div>

              <div className="text-center pt-2">
                <label className="text-base font-black text-orange-400 uppercase block mb-1">🕒 Horário da Entrega</label>
                <div className="text-3xl font-black text-orange-500 mb-3 select-none">{horario}</div>
                <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto p-1.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                  {OPCOES_HORARIOS.map((hora) => (
                    <button
                      key={hora}
                      type="button"
                      onClick={() => setHorario(hora)}
                      className={`py-4 text-center rounded-lg font-bold text-base transition-all ${horario === hora ? "bg-orange-500 text-white font-black shadow-md" : "bg-zinc-950 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"}`}
                    >
                      {hora}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-5 rounded-2xl space-y-4 shadow-md">
              <div>
                <label className="text-base font-black text-orange-400 uppercase block mb-2">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    onClick={() => setPagamento("Pix")}
                    className={`p-5 rounded-xl border text-lg font-black text-center uppercase tracking-wider transition-all ${pagamento === "Pix" ? "bg-teal-500/10 border-teal-500 text-teal-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}
                  >
                    📲 PIX
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPagamento("Dinheiro")}
                    className={`p-5 rounded-xl border text-lg font-black text-center uppercase tracking-wider transition-all ${pagamento === "Dinheiro" ? "bg-orange-500/10 border-orange-500 text-orange-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}
                  >
                    💵 DINHEIRO
                  </button>
                </div>
              </div>

              {pagamento === "Dinheiro" && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-base font-black text-orange-400 uppercase block mb-2">Precisa de troco para quanto?</label>
                  <input 
                    type="number"
                    inputMode="decimal"
                    placeholder="50" 
                    value={trocoPara} 
                    onChange={(e) => setTrocoPara(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-400 rounded-xl p-5 text-lg text-zinc-100 font-bold outline-none transition-all" 
                  />
                  {trocoCalculado > 0 && (
                    <p className="text-sm text-emerald-400 font-bold pt-1">Seu troco será de: R$ {trocoCalculado.toFixed(2)}</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl space-y-1.5">
              <div className="flex justify-between text-zinc-400 font-medium"><span>Itens adicionados:</span><span>{totalItensSelecionados}x</span></div>
              {descuentoCombo > 0 && (
                <div className="flex justify-between text-emerald-400 font-bold"><span>Combo Desconto:</span><span>- R$ {descuentoCombo.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between items-center text-zinc-100 font-black pt-1.5 border-t border-zinc-800">
                <span>TOTAL A PAGAR:</span>
                <span className="text-base text-emerald-400">R$ {valorTotalFinal.toFixed(2)}</span>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={enviandoPedido || valorTotalFinal === 0}
              className="w-full py-6 bg-orange-500 disabled:opacity-30 disabled:pointer-events-none text-white text-lg font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
            >
              {enviandoPedido ? "Enviando..." : "🛒 FINALIZAR PEDIDO"}
            </button>
          </form>
        </div>
      )}

      {/* REVISADO: Sem comparação redundante com "sucesso" */}
      {totalItensSelecionados > 0 && (
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
                Cardápio
              </button>
            )}
          </div>
        </div>
      )}

    </main>
  )
}