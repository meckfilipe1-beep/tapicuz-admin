"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
// 1. NOVOS IMPORTS DO FIRESTORE JUNTO COM OS OUTROS
import { collection, addDoc, doc, onSnapshot } from "firebase/firestore"

const PRECOS_PRODUTOS: { [key: string]: number } = {
  tapiocaMolhada: 8.00,
  tapiocaManteiga: 6.00,
  tapiocaQueijo: 8.00,
  cuscuzMilho: 5.00,
  cuscuzArroz: 6.00,
  cafe: 4.00
}

const OPCOES_HORARIOS = [
  "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", 
  "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", 
  "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", 
  "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", 
  "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", 
  "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", 
  "23:30"
]

export default function Home() {
  // 2. NOVO STATE DA LOJA PERTO DOS OUTROS USESTATE
  const [lojaAberta, setLojaAberta] = useState<boolean>(true)

  const [nome, setNome] = useState("")
  const [endereco, setEndereco] = useState("")
  const [pagamento, setPagamento] = useState<"Pix" | "Dinheiro">("Pix")
  const [trocoPara, setTrocoPara] = useState("")
  const [horario, setHorario] = useState("07:00")
  const [listaHorariosAberta, setListaHorariosAberta] = useState(false)
  
  const [itens, setItens] = useState({
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cafe: 0,
  })

  const [pedidoEnviado, setPedidoEnviado] = useState(false)
  const [carregando, setCarregando] = useState(false)

  // 3. LER O FIREBASE EM TEMPO REAL (FECHAMENTO AUTOMÁTICO)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "configuracoes", "loja"),
      (snapshot) => {
        if (snapshot.exists()) {
          setLojaAberta(snapshot.data().aberta)
        }
      }
    )

    return () => unsubscribe()
  }, [])

  function alterarQuantidade(produto: string, valor: number) {
    setItens(prev => ({
      ...prev,
      [produto]: Math.max(0, (prev as any)[produto] + valor)
    }))
  }

  function calcularTotalECombos() {
    let subtotal = 0
    let qtdComidas = 0
    let qtdCafes = itens.cafe

    Object.entries(itens).forEach(([key, value]) => {
      subtotal += PRECOS_PRODUTOS[key] * value
      if (key !== "cafe") {
        qtdComidas += value
      }
    })

    let descontoTotal = 0
    if (qtdComidas > 0 && qtdCafes > 0) {
      const quantidadeCombos = Math.min(qtdComidas, qtdCafes)
      let cafesAplicados = 0

      Object.entries(itens).forEach(([key, value]) => {
        if (key !== "cafe" && value > 0) {
          const comidasDesteTipoNoCombo = Math.min(value, quantidadeCombos - cafesAplicados)
          if (comidasDesteTipoNoCombo > 0) {
            const precoNormalPar = PRECOS_PRODUTOS[key] + PRECOS_PRODUTOS.cafe
            const descontoPorPar = precoNormalPar - 10.00
            descontoTotal += descontoPorPar * comidasDesteTipoNoCombo
            cafesAplicados += comidasDesteTipoNoCombo
          }
        }
      })
    }

    return {
      total: Math.max(0, subtotal - descontoTotal),
      temCombo: descontoTotal > 0
    }
  }

  const { total: valorTotal, temCombo } = calcularTotalECombos()
  const trocoParaNumerico = parseFloat(trocoPara.replace(",", ".")) || 0
  const trocoCalculado = pagamento === "Dinheiro" && trocoParaNumerico > valorTotal ? trocoParaNumerico - valorTotal : 0

  async function enviarPedido(e: any) {
    e.preventDefault()
    if (!nome.trim() || valorTotal === 0 || carregando) return

    setCarregando(true)

    const dadosPedido = {
      nome: nome.trim(),
      endereco: endereco.trim() || "Retirada no Balcão",
      pagamento,
      troco: pagamento === "Dinheiro" ? trocoCalculado : 0,
      valorTotal,
      horario,
      pago: false,
      concluido: false,
      dataCriacao: new Date().toISOString(),
      itens
    }

    try {
      await addDoc(collection(db, "pedidos"), dadosPedido)
      setPedidoEnviado(true)
    } catch (error) {
      console.error("Erro ao enviar pedido:", error)
      alert("Erro ao enviar o pedido, tente novamente!")
    } finally {
      setCarregando(false)
    }
  }

  // 4. TRAVA VISUAL CASO A LOJA ESTEJA FECHADA (LOGO NO COMEÇO DO RETURN)
  if (!lojaAberta) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 mb-3">
            TAPICUZ DA SUL ☀️
          </h1>

          <p className="text-xl font-bold text-white mb-2">
            Estamos Fechados
          </p>

          <p className="text-zinc-400 text-sm">
            Não estamos recebendo pedidos no momento.
            Volte mais tarde.
          </p>
        </div>
      </main>
    )
  }

  if (pedidoEnviado) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-2xl mx-auto font-black">✓</div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight">Pedido Enviado!</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">Seu pedido já foi encaminhado para a nossa cozinha. Prepare-se para saborear o melhor Tapicuz! ☕</p>
          <div className="pt-2 bg-zinc-950/40 border border-zinc-800/60 p-4 rounded-2xl text-left space-y-1">
            <p className="text-[10px] uppercase font-bold text-zinc-500">Horário Agendado</p>
            <p className="text-sm font-black text-orange-400">⏱️ {horario}</p>
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black uppercase tracking-wider py-3.5 rounded-2xl transition-all">Fazer Novo Pedido</button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-8">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="text-center py-4">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 tracking-tight">
            TAPICUZ DA SUL ☀️
          </h1>
          <p className="text-zinc-400 text-xs mt-1 font-medium">Faça seu pedido de forma rápida e agendada</p>
        </div>

        {/* PRODUTOS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <h2 className="text-xs font-black text-orange-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Cardápio do Dia</h2>
          
          <div className="space-y-3">
            {[
              { id: "tapiocaMolhada", nome: "Tapioca Molhada", preco: 8.00 },
              { id: "tapiocaManteiga", nome: "Tapioca com Manteiga", preco: 6.00 },
              { id: "tapiocaQueijo", nome: "Tapioca com Queijo", preco: 8.00 },
              { id: "cuscuzMilho", nome: "Cuscuz de Milho ", preco: 5.00 },
              { id: "cuscuzArroz", nome: "Cuscuz de Arroz", preco: 6.00 },
              { id: "cafe", nome: "Café com Leite", preco: 4.00 },
            ].map((prod) => (
              <div key={prod.id} className="flex items-center justify-between bg-zinc-950 p-3 rounded-2xl border border-zinc-800/60 transition-all hover:border-zinc-700">
                <div>
                  <h3 className="font-bold text-zinc-200 text-xs">{prod.nome}</h3>
                  <p className="text-emerald-400 text-xs font-black mt-0.5">R$ {prod.preco.toFixed(2)}</p>
                </div>
                
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                  <button type="button" onClick={() => alterarQuantidade(prod.id, -1)} className="w-7 h-7 bg-zinc-950 rounded-lg text-zinc-400 font-bold text-sm active:scale-90 select-none transition-all">-</button>
                  <span className="font-black text-xs text-white w-5 text-center">{(itens as any)[prod.id]}</span>
                  <button type="button" onClick={() => alterarQuantidade(prod.id, 1)} className="w-7 h-7 bg-zinc-950 rounded-lg text-zinc-400 font-bold text-sm active:scale-90 select-none transition-all">+</button>
                </div>
              </div>
            ))}
          </div>

          {temCombo && (
            <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 p-3 rounded-2xl text-center font-bold text-[11px] uppercase tracking-wide animate-pulse">
              🎉 Combo Ativado: 1 Comida + 1 Café por apenas R$ 10,00!
            </div>
          )}
        </div>

        {/* FORMULÁRIO DE ENVIO */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <h2 className="text-xs font-black text-orange-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Detalhes da Entrega</h2>
          
          <form onSubmit={enviarPedido} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Seu Nome completo</label>
              <input type="text" required placeholder="Digite seu nome" value={nome} onChange={(e) => setNome(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none transition-all placeholder:text-zinc-600" />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Endereço de Entrega (Opcional)</label>
              <input type="text" placeholder="Deixe em branco para Retirada no Balcão" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none transition-all placeholder:text-zinc-600" />
            </div>

            {/* HORÁRIO AGENDADO COM DROPDOWN EM GRID */}
            <div className="relative">
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Horário de Retirada / Entrega</label>
              <button
                type="button"
                onClick={() => setListaHorariosAberta(!listaHorariosAberta)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none text-left flex justify-between items-center transition-all"
              >
                <span className="font-bold text-zinc-200">⏱️ {horario}</span>
                <span className="text-[10px] bg-zinc-900 px-2 py-1 rounded-md text-zinc-400 font-bold">{listaHorariosAberta ? "Fechar" : "Alterar"}</span>
              </button>

              {listaHorariosAberta && (
                <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 p-2 max-h-56 overflow-y-auto">
                  <div className="grid grid-cols-4 gap-1">
                    {OPCOES_HORARIOS.map((hora) => (
                      <button
                        key={hora}
                        type="button"
                        onClick={() => {
                          setHorario(hora)
                          setListaHorariosAberta(false)
                        }}
                        className={`p-2 rounded-lg text-[11px] font-bold transition-all text-center ${horario === hora ? "bg-orange-500 text-white" : "hover:bg-zinc-950 text-zinc-400 hover:text-zinc-200"}`}
                      >
                        {hora}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Forma de Pagamento</label>
              <select value={pagamento} onChange={(e) => setPagamento(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none transition-all">
                <option value="Pix">Pix (Código Copia e Cola / QR Code)</option>
                <option value="Dinheiro">Dinheiro (No ato da entrega)</option>
              </select>
            </div>

            {pagamento === "Dinheiro" && (
              <div className="animate-fade-in">
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Troco para quanto?</label>
                <input type="text" placeholder="Ex: R$ 50,00" value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none transition-all placeholder:text-zinc-600" />
                {trocoCalculado > 0 && (
                  <p className="text-[11px] text-amber-400 mt-1.5 font-medium pl-1">Seu troco será de: <strong>R$ {trocoCalculado.toFixed(2)}</strong></p>
                )}
              </div>
            )}

            {/* RESUMO E ENVIO */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-wider">Total do Pedido</span>
                <p className="text-2xl font-black text-emerald-400">R$ {valorTotal.toFixed(2)}</p>
              </div>
              
              <button 
                type="submit" 
                disabled={valorTotal === 0 || carregando} 
                className={`px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md ${valorTotal === 0 || carregando ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/10"}`}
              >
                {carregando ? "Enviando..." : "Enviar Pedido"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </main>
  )
}