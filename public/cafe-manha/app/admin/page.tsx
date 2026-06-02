"use client"

import { useEffect, useState, useRef } from "react"
import { db } from "@/lib/firebase"
import {
  collection,
  onSnapshot,
  query,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  setDoc,
  getDocs
} from "firebase/firestore"

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

function formatarNomeItem(nomeChave: string) {
  const nomes: { [key: string]: string } = {
    tapiocaMolhada: "Tapioca Molhada",
    tapiocaManteiga: "Tapioca com Manteiga",
    tapiocaQueijo: "Tapioca com Queijo",
    cuscuzMilho: "Cuscuz de Milho",
    cuscuzArroz: "Cuscuz de Arroz",
    cafe: "Café"
  }
  return nomes[nomeChave] || nomeChave
}

interface Pedido {
  id: string
  nome: string
  endereco: string
  pagamento: string
  troco: number
  valorTotal: number
  horario: string
  pago: boolean
  concluido: boolean
  dataCriacao?: any
  itens: {
    tapiocaMolhada: number
    tapiocaManteiga: number
    tapiocaQueijo: number
    cuscuzMilho: number
    cuscuzArroz: number
    cafe: number
  }
}

interface HistoricoCaixa {
  id: string
  tipo: "fechamento_turno"
  data: string
  totalPix: number
  totalDinheiro: number
  despesas: number
  saldoLiquido: number
}

export default function AdminPainel() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [historicoCaixas, setHistoricoCaixas] = useState<HistoricoCaixa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<"pedidos" | "avulso" | "historico" | "caixa">("pedidos")
  const [lojaAberta, setLojaAberta] = useState<boolean>(true)

  // Controle de interface e Modais Customizados
  const [pedidoConcluindoId, setPedidoConcluindoId] = useState<string | null>(null)
  const [notificacaoCaixa, setNotificacaoCaixa] = useState<string | null>(null)
  const [mostrarResumoFinalAvulso, setMostrarResumoFinalAvulso] = useState(false)
  const [pedidoDetalhado, setPedidoDetalhado] = useState<Pedido | null>(null)
  const [exibirFaturamentoGeral, setExibirFaturamentoGeral] = useState(false)
  const [expandirZonaPerigo, setExpandirZonaPerigo] = useState(false)
  
  // Modais de confirmação criativos
  const [modalConfirmarTurno, setModalConfirmarTurno] = useState(false)
  const [modalConfirmarReset, setModalConfirmarReset] = useState(false)

  // Entrada de Despesas simples
  const [valorDespesaInput, setValorDespesaInput] = useState("")
  const [totalDespesasAcumuladas, setTotalDespesasAcumuladas] = useState(0)

  // Estados do Pedido Avulso
  const [nomeAvulso, setNomeAvulso] = useState("")
  const [enderecoAvulso, setEnderecoAvulso] = useState("")
  const [pagamentoAvulso, setPagamentoAvulso] = useState<"Pix" | "Dinheiro">("Pix")
  const [trocoParaAvulso, setTrocoParaAvulso] = useState("")
  const [horarioAvulso, setHorarioAvulso] = useState("07:00")
  const [valorTotalAvulso, setValorTotalAvulso] = useState("0.00")
  const [criandoAvulso, setCriandoAvulso] = useState(false)
  
  const [listaHorariosAberta, setListaHorariosAberta] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [itensAvulsos, setItensAvulsos] = useState({
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cafe: 0,
  })

  // Escuta o status da loja e despesas temporárias
  useEffect(() => {
    const refLoja = doc(db, "configuracoes", "loja")
    const unsubscribeStatus = onSnapshot(refLoja, (snap) => {
      if (snap.exists()) {
        setLojaAberta(snap.data().aberta)
        setTotalDespesasAcumuladas(snap.data().despesas || 0)
      }
    })

    const qCaixas = query(collection(db, "historico_caixas"))
    const unsubscribeCaixas = onSnapshot(qCaixas, (snap) => {
      const lista: HistoricoCaixa[] = []
      snap.forEach(d => lista.push({ id: d.id, ...d.data() } as HistoricoCaixa))
      setHistoricoCaixas(lista.sort((a,b) => b.data.localeCompare(a.data)))
    })

    return () => {
      unsubscribeStatus()
      unsubscribeCaixas()
    }
  }, [])

  useEffect(() => {
    const q = query(collection(db, "pedidos"))
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const listaPedidos: Pedido[] = []
      querySnapshot.forEach((doc) => {
        listaPedidos.push({ id: doc.id, ...doc.data() } as Pedido)
      })
      listaPedidos.sort((a, b) => a.horario.localeCompare(b.horario))
      setPedidos(listaPedidos)
      setCarregando(false)
    })

    function mapearCliqueFora(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setListaHorariosAberta(false)
      }
    }
    document.addEventListener("mousedown", mapearCliqueFora)

    return () => {
      unsubscribe()
      document.removeEventListener("mousedown", mapearCliqueFora)
    }
  }, [])

  useEffect(() => {
    let subtotal = 0
    let qtdComidas = 0
    let qtdCafes = itensAvulsos.cafe

    Object.entries(itensAvulsos).forEach(([key, qtd]) => {
      subtotal += (PRECOS_PRODUTOS[key] || 0) * qtd
      if (key !== "cafe") qtdComidas += qtd
    })

    if (qtdComidas > 0 && qtdCafes > 0) {
      const CabalCombos = Math.min(qtdComidas, qtdCafes)
      let descontoTotal = 0
      let cafesAplicados = 0

      Object.entries(itensAvulsos).forEach(([key, qtd]) => {
        if (key !== "cafe" && qtd > 0) {
          const comidasDesteTipoNoCombo = Math.min(qtd, CabalCombos - cafesAplicados)
          if (comidasDesteTipoNoCombo > 0) {
            const descontoPorPar = (PRECOS_PRODUTOS[key] + PRECOS_PRODUTOS.cafe) - 10.00
            descontoTotal += descontoPorPar * comidasDesteTipoNoCombo
            cafesAplicados += comidasDesteTipoNoCombo
          }
        }
      })
      subtotal -= descontoTotal
    }
    setValorTotalAvulso(subtotal.toFixed(2))
  }, [itensAvulsos])

  const valorTotalAvulsoNumerico = parseFloat(valorTotalAvulso) || 0
  const trocoParaAvulsoNumerico = parseFloat(trocoParaAvulso.replace(",", ".")) || 0
  const trocoAvulsoCalculado = pagamentoAvulso === "Dinheiro" && trocoParaAvulsoNumerico > valorTotalAvulsoNumerico 
    ? trocoParaAvulsoNumerico - valorTotalAvulsoNumerico 
    : 0

  function alterarQtdAvulso(campo: string, valor: number) {
    setItensAvulsos(prev => ({
      ...prev,
      [campo]: Math.max(0, (prev as any)[campo] + valor)
    }))
  }

  async function iniciarConclusaoPedido(id: string) {
    setPedidoConcluindoId(id)
    setTimeout(async () => {
      try {
        await updateDoc(doc(db, "pedidos", id), { concluido: true })
      } catch (error) {
        console.error(error)
      } finally {
        setPedidoConcluindoId(null)
      }
    }, 1500)
  }

  async function deletarDoHistorico(id: string) {
    try {
      await deleteDoc(doc(db, "pedidos", id))
      if (pedidoDetalhado?.id === id) setPedidoDetalhado(null)
    } catch (error) {
      console.error(error)
    }
  }

  async function alternarStatusLoja() {
    try {
      const novoStatus = !lojaAberta
      await setDoc(doc(db, "configuracoes", "loja"), { aberta: novoStatus }, { merge: true })
      setLojaAberta(novoStatus)
      setNotificacaoCaixa(`Pedidos: ${novoStatus ? "LIGADOS" : "DESLIGADOS"}`)
      setTimeout(() => setNotificacaoCaixa(null), 2500)
    } catch (error) {
      console.error(error)
    }
  }

  async function lancarDespesaSimples(e: any) {
    e.preventDefault()
    const valor = parseFloat(valorDespesaInput.replace(",", "."))
    if (isNaN(valor) || valor <= 0) return

    try {
      const novaDespesaTotal = totalDespesasAcumuladas + valor
      await setDoc(doc(db, "configuracoes", "loja"), { despesas: novaDespesaTotal }, { merge: true })
      setTotalDespesasAcumuladas(novaDespesaTotal)
      setValorDespesaInput("")
      setNotificacaoCaixa(`Despesa de R$ ${valor.toFixed(2)} lançada!`)
      setTimeout(() => setNotificacaoCaixa(null), 3000)
    } catch (error) {
      console.error(error)
    }
  }

  async function executarFechamentoTurno() {
    const saldoLiquidoCalculado = faturamentoTotal - totalDespesasAcumuladas

    const dadosFechamento = {
      tipo: "fechamento_turno",
      data: new Date().toLocaleString("pt-BR"),
      totalPix,
      totalDinheiro,
      despesas: totalDespesasAcumuladas,
      saldoLiquido: saldoLiquidoCalculado
    }

    try {
      await addDoc(collection(db, "historico_caixas"), dadosFechamento)

      const snapPedidos = await getDocs(collection(db, "pedidos"))
      const promessasDelecao = snapPedidos.docs.map(d => deleteDoc(doc(db, "pedidos", d.id)))
      await Promise.all(promessasDelecao)
      
      await setDoc(doc(db, "configuracoes", "loja"), { despesas: 0, aberta: lojaAberta }, { merge: true })
      
      setTotalDespesasAcumuladas(0)
      setExibirFaturamentoGeral(false)
      setModalConfirmarTurno(false)
      setNotificacaoCaixa("Turno arquivado! Caixa resetado e mantido aberto.")
      setTimeout(() => setNotificacaoCaixa(null), 4000)
    } catch (error) {
      console.error("Erro ao fechar turno:", error)
    }
  }

  async function executarResetTotal() {
    try {
      const snapCaixas = await getDocs(collection(db, "historico_caixas"))
      const promessasCaixas = snapCaixas.docs.map(d => deleteDoc(doc(db, "historico_caixas", d.id)))
      await Promise.all(promessasCaixas)

      const snapPedidos = await getDocs(collection(db, "pedidos"))
      const promessasPedidos = snapPedidos.docs.map(d => deleteDoc(doc(db, "pedidos", d.id)))
      await Promise.all(promessasPedidos)

      await setDoc(doc(db, "configuracoes", "loja"), { despesas: 0, aberta: false }, { merge: true })
      
      setTotalDespesasAcumuladas(0)
      setLojaAberta(false)
      setExibirFaturamentoGeral(false)
      setExpandirZonaPerigo(false)
      setModalConfirmarReset(false)
      setNotificacaoCaixa("SISTEMA RESETADO TOTALMENTE!")
      setTimeout(() => setNotificacaoCaixa(null), 4000)
    } catch (error) {
      console.error(error)
    }
  }

  function preVisualizarPedidoAvulso(e: any) {
    e.preventDefault()
    if (!nomeAvulso.trim() || valorTotalAvulsoNumerico === 0 || !lojaAberta) return
    setMostrarResumoFinalAvulso(true)
  }

  async function confirmarELancarPedidoAvulsoFinal() {
    if (criandoAvulso || !lojaAberta) return
    setCriandoAvulso(true)

    const novoPedidoAvulso = {
      nome: nomeAvulso.trim(),
      endereco: enderecoAvulso.trim() || "Retirada no Balcão",
      pagamento: pagamentoAvulso,
      troco: trocoAvulsoCalculado,
      valorTotal: valorTotalAvulsoNumerico,
      horario: horarioAvulso,
      pago: pagamentoAvulso === "Pix",
      concluido: false,
      dataCriacao: new Date().toISOString(),
      itens: itensAvulsos
    }

    try {
      await addDoc(collection(db, "pedidos"), novoPedidoAvulso)
      setNomeAvulso("")
      setEnderecoAvulso("")
      setPagamentoAvulso("Pix")
      setTrocoParaAvulso("")
      setItensAvulsos({ tapiocaMolhada:0, tapiocaManteiga:0, tapiocaQueijo:0, cuscuzMilho:0, cuscuzArroz:0, cafe:0 })
      setMostrarResumoFinalAvulso(false)
      
      setNotificacaoCaixa("Pedido realizado com sucesso! 🎉")
      setTimeout(() => setNotificacaoCaixa(null), 3500)
      
      setAbaAtiva("pedidos") 
    } catch (error) {
      console.error(error)
    } finally {
      setCriandoAvulso(false)
    }
  }

  const pedidosAtivos = pedidos.filter(p => !p.concluido)
  const pedidosConcluidos = pedidos.filter(p => p.concluido)
  const faturamentoTotal = pedidosConcluidos.reduce((acc, p) => acc + p.valorTotal, 0)
  const totalPix = pedidosConcluidos.filter(p => p.pagamento === "Pix").reduce((acc, p) => acc + p.valorTotal, 0)
  const totalDinheiro = pedidosConcluidos.filter(p => p.pagamento === "Dinheiro").reduce((acc, p) => acc + p.valorTotal, 0)
  const saldoLiquidoAtual = faturamentoTotal - totalDespesasAcumuladas

  const faturamentoAcumuladoGeral = historicoCaixas.reduce((acc, c) => acc + (c.saldoLiquido || 0), 0) + saldoLiquidoAtual

  // CALCULO DE QUANTIDADE DE ITENS VENDIDOS NO TURNO ATUAL (ORDEM DECRESCENTE)
  const contagemItensTurno: { [key: string]: number } = {
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cafe: 0,
  }

  pedidosConcluidos.forEach(p => {
    if (p.itens) {
      Object.keys(contagemItensTurno).forEach(key => {
        contagemItensTurno[key] += (p.itens as any)[key] || 0
      })
    }
  })

  const itensOrdenadosPorVenda = Object.entries(contagemItensTurno)
    .filter(([_, qtd]) => qtd > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <main className="min-h-screen bg-zinc-950 p-4 sm:p-8 text-zinc-100 relative">
      
      {/* ================= NOTIFICADOR FLUTUANTE CUSTOMIZADO ================= */}
      {notificacaoCaixa && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <span className="text-xs font-black text-emerald-400 bg-zinc-900 border-2 border-emerald-500/30 shadow-2xl px-6 py-3 rounded-2xl tracking-wide uppercase block">
            {notificacaoCaixa}
          </span>
        </div>
      )}

      {/* ================= MODAL CUSTOMIZADO: RESUMO E CONFIRMAÇÃO DE FECHAMENTO ================= */}
      {modalConfirmarTurno && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 text-center space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-lg mx-auto font-bold shadow-md">🗂️</div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-black text-zinc-200 uppercase tracking-wide">Resumo Completo do Turno</h3>
              <p className="text-zinc-500 font-medium">Confira todos os detalhes do dia antes de fechar e arquivar.</p>
            </div>

            {/* FINANCEIRO DO DIA */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-left space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block border-b border-zinc-900 pb-1">Balanço Financeiro</span>
              <div className="flex justify-between text-zinc-400"><span>Entradas via Pix:</span><span className="font-bold text-teal-400">R$ {totalPix.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>Entradas em Dinheiro:</span><span className="font-bold text-amber-500">R$ {totalDinheiro.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>Despesas/Retiradas:</span><span className="font-bold text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</span></div>
              <div className="flex justify-between text-white border-t border-zinc-900 pt-2 font-black mt-1">
                <span className="text-zinc-300">SALDO LÍQUIDO DO DIA:</span>
                <span className="text-emerald-400 text-sm">R$ {saldoLiquidoAtual.toFixed(2)}</span>
              </div>
            </div>

            {/* PRODUTOS MAIS VENDIDOS */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-left space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block border-b border-zinc-900 pb-1">Ranking de Itens Saídos</span>
              {itensOrdenadosPorVenda.length === 0 ? (
                <p className="text-zinc-500 italic py-2 text-center">Nenhum item faturado neste turno.</p>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {itensOrdenadosPorVenda.map(([key, qtd], index) => (
                    <div key={key} className="flex justify-between items-center text-zinc-300">
                      <span className="font-medium">
                        <strong className="text-orange-400/70 mr-1.5 text-[10px]">#{index + 1}</strong>
                        {formatarNomeItem(key)}
                      </span>
                      <span className="font-black bg-zinc-900 px-2 py-0.5 rounded-md text-orange-400 border border-zinc-800/60">{qtd}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 font-medium px-4">Ao confirmar, a fila atual será limpa para o próximo turno e o relatório será guardado.</p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setModalConfirmarTurno(false)} className="py-3 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-xl text-zinc-300 transition-all">Voltar</button>
              <button type="button" onClick={executarFechamentoTurno} className="py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:opacity-95 font-black rounded-xl text-white uppercase tracking-wider transition-all shadow-md">Confirmar & Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CUSTOMIZADO: RESET COMPLETO ================= */}
      {modalConfirmarReset && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-red-500/30 w-full max-w-sm rounded-3xl p-6 text-center space-y-4 shadow-2xl text-xs">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center text-lg mx-auto font-bold">💥</div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-red-400 uppercase">Ação Irreversível</h3>
              <p className="text-zinc-400 font-bold">Isso apagará permanentemente todo o histórico de faturamento, caixas arquivados e turnos de toda a aplicação.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setModalConfirmarReset(false)} className="py-3 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-xl text-zinc-300">Cancelar</button>
              <button type="button" onClick={executarResetTotal} className="py-3 bg-red-600 hover:bg-red-700 font-black rounded-xl text-white uppercase">Zerar Tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL EXCLUSIVO: FATURAMENTO GERAL ================= */}
      {exibirFaturamentoGeral && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-emerald-500/30 w-full max-w-sm rounded-3xl p-6 text-center space-y-5 shadow-2xl">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center text-xl mx-auto font-bold shadow-inner">🧮</div>
            <div className="space-y-1">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Relatório Consolidado</h3>
              <p className="text-sm font-bold text-zinc-200">Faturamento Acumulado Geral</p>
            </div>
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-inner">
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-500 block mb-1">Valor Total Líquido</span>
              <p className="text-3xl font-black text-emerald-400 tracking-tight">R$ {faturamentoAcumuladoGeral.toFixed(2)}</p>
            </div>
            <button type="button" onClick={() => setExibirFaturamentoGeral(false)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-black uppercase text-xs rounded-xl tracking-wider transition-all shadow-md">Fechar Relatório</button>
          </div>
        </div>
      )}

      {/* ================= MODAL DETALHES DO PEDIDO ================= */}
      {pedidoDetalhado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-orange-400">Detalhes do Pedido</h2>
              <button onClick={() => setPedidoDetalhado(null)} className="w-7 h-7 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 text-sm font-bold">✕</button>
            </div>
            <div className="space-y-2.5 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">Cliente:</span><span className="font-black text-white uppercase">{pedidoDetalhado.nome}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">Horário:</span><span className="font-black text-amber-400">⏱ {pedidoDetalhado.horario}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">Local:</span><span className="font-bold text-zinc-300 truncate max-w-[200px]">{pedidoDetalhado.endereco}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">Pagamento:</span><span className="font-black text-teal-400 uppercase">{pedidoDetalhado.pagamento}</span></div>
            </div>
            <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/60">
              {Object.entries(pedidoDetalhado.itens || {}).map(([key, qtd]) => qtd > 0 && (
                <div key={key} className="flex justify-between text-zinc-300">
                  <span>{formatarNomeItem(key)}</span>
                  <span className="font-black text-orange-400">{qtd}x</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-emerald-500/10">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Faturamento Recebido</span>
              <p className="text-xl font-black text-emerald-400">R$ {pedidoDetalhado.valorTotal.toFixed(2)}</p>
            </div>
            <div className="pt-2 flex gap-2">
              <button onClick={() => setPedidoDetalhado(null)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold uppercase text-center">Fechar</button>
              <button onClick={() => deletarDoHistorico(pedidoDetalhado.id)} className="px-4 py-3 bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl font-bold">🗑️</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CONFIRMAÇÃO AVULSO ================= */}
      {mostrarResumoFinalAvulso && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl text-xs">
            <h2 className="text-sm font-black uppercase text-orange-400 text-center tracking-wider">Confirmar Lançamento</h2>
            
            <div className="space-y-2.5 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <p className="text-zinc-400 font-bold">Cliente: <span className="text-white uppercase font-black">{nomeAvulso}</span></p>
              <p className="text-zinc-400 font-bold">Entrega/Obs: <span className="text-yellow-400 font-medium">📍 {enderecoAvulso || "Retirada no Balcão"}</span></p>
              <p className="text-zinc-400 font-bold">Horário Estimado: <span className="text-amber-400 font-black">⏱️ {horarioAvulso}</span></p>
              <p className="text-zinc-400 font-bold">Pagamento: <span className="text-teal-400 uppercase font-black">{pagamentoAvulso}</span></p>
            </div>

            <div className="space-y-1 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
              {Object.entries(itensAvulsos).map(([key, qtd]) => qtd > 0 && (
                <div key={key} className="flex justify-between text-zinc-300 text-[11px]">
                  <span>{formatarNomeItem(key)}</span>
                  <span className="font-black text-orange-400">{qtd}x</span>
                </div>
              ))}
            </div>

            <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-1">
              <div className="flex justify-between items-center font-bold">
                <span className="text-zinc-400 uppercase text-[10px]">Valor Total:</span>
                <span className="text-lg font-black text-emerald-400">R$ {valorTotalAvulso}</span>
              </div>
              {pagamentoAvulso === "Dinheiro" && trocoParaAvulsoNumerico > 0 && (
                <div className="flex justify-between items-center text-[11px] border-t border-zinc-800 pt-1.5 mt-1">
                  <span className="text-zinc-500">Valor Pago: R$ {trocoParaAvulsoNumerico.toFixed(2)}</span>
                  <span className="text-red-400 font-black">Troco: R$ {trocoAvulsoCalculado.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setMostrarResumoFinalAvulso(false)} className="py-3 bg-zinc-800 text-zinc-300 rounded-xl font-bold uppercase">← Ajustar</button>
              <button onClick={confirmarELancarPedidoAvulsoFinal} disabled={criandoAvulso || !lojaAberta} className="py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-black uppercase">Lançar Agora ✓</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* ================= TOPBAR COM SWITCH SLIDER ================= */}
        <div className="flex flex-col gap-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
          <div className="flex flex-row justify-between items-center w-full">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500">TAPICUZ ADMIN ☀️</h1>
              <p className="text-[10px] sm:text-xs text-zinc-500">Painel de Controle</p>
            </div>

            {/* SWITCH TOGGLE MINIMALISTA */}
            <div className="flex items-center gap-3 bg-zinc-950/60 border border-zinc-800/80 py-2 px-4 rounded-2xl shadow-inner">
              <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${lojaAberta ? "text-emerald-400" : "text-zinc-500"}`}>
                {lojaAberta ? "Pedidos Ativos" : "Pedidos Pausados"}
              </span>
              <button 
                type="button"
                onClick={alternarStatusLoja}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 outline-none ${lojaAberta ? "bg-emerald-500" : "bg-zinc-800"}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-300 ${lojaAberta ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <button onClick={() => setAbaAtiva("pedidos")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "pedidos" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">📋</span>
              <span>Pedidos</span>
            </button>
            <button onClick={() => setAbaAtiva("avulso")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "avulso" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">➕</span>
              <span>Pedido Avulso</span>
            </button>
            <button onClick={() => setAbaAtiva("historico")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "historico" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">📜</span>
              <span>Vendas ({pedidosConcluidos.length})</span>
            </button>
            <button onClick={() => setAbaAtiva("caixa")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "caixa" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">💰</span>
              <span>Caixa Geral</span>
            </button>
          </div>
        </div>

        {/* ================= ABA: TOTAL DE PEDIDOS ================= */}
        {abaAtiva === "pedidos" && (
          <div className="space-y-6 animate-fade-in">
            
            {/* CONTADORES DE PANORAMA DA FILA */}
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-center shadow-md">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-0.5">Na Fila Agora</span>
                <p className="text-2xl font-black text-orange-400">{pedidosAtivos.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-center shadow-md">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-0.5">Total de Pedidos</span>
                <p className="text-2xl font-black text-amber-500">{pedidos.length}</p>
              </div>
            </div>

            {carregando ? (
              <div className="text-center py-12 text-zinc-500 text-xs animate-pulse">Sincronizando banco...</div>
            ) : pedidosAtivos.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800 border-dashed rounded-3xl text-zinc-500 text-xs font-medium">Nenhum pedido ativo na fila de produção.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {pedidosAtivos.map((pedido) => {
                  const estaConcluindo = pedidoConcluindoId === pedido.id
                  return (
                    <div key={pedido.id} className={`border rounded-3xl p-5 space-y-4 shadow-xl transition-all flex flex-col justify-between duration-300 ${estaConcluindo ? "bg-emerald-500 border-emerald-400 text-zinc-950 scale-[0.98] opacity-90" : "bg-zinc-900 border-zinc-800 text-zinc-100"}`}>
                      {estaConcluindo ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                          <span className="text-3xl animate-bounce">🎉</span>
                          <h3 className="font-black text-sm uppercase text-white">Pedido Concluído!</h3>
                        </div>
                      ) : (
                        <>
                          <div className="bg-black/50 border border-zinc-800 rounded-2xl py-2 px-4 flex items-center justify-center shadow-inner">
                            <span className="text-lg font-black text-orange-400 tracking-wider">⏱️ {pedido.horario}</span>
                          </div>
                          <div className="border-b border-zinc-800/60 pb-2.5 text-center">
                            <h3 className="font-black text-white text-sm uppercase tracking-tight">{pedido.nome}</h3>
                            <p className="text-xs text-yellow-400 font-bold tracking-wide mt-1 bg-yellow-400/5 py-1 px-2 rounded-lg border border-yellow-400/10 inline-block max-w-full truncate">📍 {pedido.endereco}</p>
                          </div>
                          <div className="space-y-1.5 bg-black/20 p-3 rounded-xl border border-zinc-800/60 text-xs">
                            {Object.entries(pedido.itens || {}).map(([key, qtd]) => qtd > 0 && (
                              <div key={key} className="flex justify-between text-zinc-100">
                                <span><strong className="text-amber-300 font-black mr-1">{qtd}x</strong> {formatarNomeItem(key)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-black/40 p-3 rounded-xl border border-zinc-800 flex justify-between items-center text-xs">
                            <div>
                              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Forma</span>
                              <span className="font-black text-zinc-200 uppercase">{pedido.pagamento}</span>
                              {pedido.pagamento === "Dinheiro" && pedido.troco > 0 && (
                                <span className="font-black text-red-400 block mt-0.5 text-[10px]">Troco: R$ {pedido.troco.toFixed(2)}</span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Total</span>
                              <span className="text-base font-black text-emerald-400">R$ {pedido.valorTotal.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="pt-1">
                            <button type="button" onClick={() => iniciarConclusaoPedido(pedido.id)} className="w-full py-3.5 bg-white hover:bg-zinc-100 text-zinc-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md">Concluir Pedido</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA: HISTÓRICO ================= */}
        {abaAtiva === "historico" && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl text-xs">
              <h2 className="text-sm font-black text-orange-400 uppercase tracking-wider border-b border-zinc-800 pb-2 text-center">Vendas Faturadas do Turno Atual</h2>
              {pedidosConcluidos.length === 0 ? (
                <div className="text-center py-6 text-zinc-500">Nenhum pedido finalizado no turno ainda.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 font-bold uppercase">
                        <th className="pb-2">Horário</th>
                        <th className="pb-2">Cliente</th>
                        <th className="pb-2">Pagamento</th>
                        <th className="pb-2">Total</th>
                        <th className="pb-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosConcluidos.map((pedido) => (
                        <tr key={pedido.id} className="border-b border-zinc-800/30 hover:bg-zinc-950/20">
                          <td className="py-2.5 font-black text-amber-400">{pedido.horario}</td>
                          <td className="py-2.5 font-bold text-zinc-200 uppercase">{pedido.nome}</td>
                          <td className="py-2.5 font-bold text-zinc-400">{pedido.pagamento}</td>
                          <td className="py-2.5 font-black text-emerald-400">R$ {pedido.valorTotal.toFixed(2)}</td>
                          <td className="py-2.5 text-center">
                            <button onClick={() => setPedidoDetalhado(pedido)} className="bg-zinc-800 text-zinc-300 font-bold px-2 py-1 rounded-md">👁️ Detalhes</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= ABA: CAIXA GERAL ================= */}
        {abaAtiva === "caixa" && (
          <div className="space-y-6 animate-fade-in">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Turno: Pix</span>
                <p className="text-lg font-black text-teal-400">R$ {totalPix.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Turno: Dinheiro</span>
                <p className="text-lg font-black text-amber-500">R$ {totalDinheiro.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-red-900/30 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest block">Turno: Despesas</span>
                <p className="text-lg font-black text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl bg-gradient-to-b from-zinc-900 to-zinc-950">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Turno: Líquido Atual</span>
                <p className="text-lg font-black text-white">R$ {saldoLiquidoAtual.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              
              {/* CARD LANÇAMENTO DE DESPESAS */}
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-red-400 uppercase tracking-wider mb-2">💸 Lançar Despesa / Retirada</h3>
                  <p className="text-[11px] text-zinc-500 mb-4">Saídas imediatas feitas do caixa físico corrente.</p>
                </div>
                <form onSubmit={lancarDespesaSimples} className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    placeholder="Valor R$ (Ex: 15.50)" 
                    value={valorDespesaInput}
                    onChange={(e) => setValorDespesaInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded-xl p-3 text-xs text-white outline-none transition-all" 
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-black px-6 rounded-xl text-xs uppercase tracking-wider transition-all">Lançar</button>
                </form>
              </div>

              {/* CARD FECHAMENTO RÁPIDO */}
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center items-center text-center space-y-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Ações do Caixa</h4>
                  <p className="text-[11px] text-zinc-500">Salve os faturamentos sem fechar o recebimento de pedidos.</p>
                </div>
                
                <button 
                  type="button" 
                  onClick={() => setModalConfirmarTurno(true)} 
                  className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-90 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
                >
                  💾 Salvar & Fechar Turno
                </button>
              </div>

            </div>

            {/* SEÇÃO DE FECHAMENTOS ANTERIORES */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-xl text-xs">
              <div className="text-center space-y-3 border-b border-zinc-800 pb-5">
                <h2 className="text-sm font-black text-zinc-300 uppercase tracking-widest">📂 RELATÓRIOS DE FECHAMENTO</h2>
                <div className="flex justify-center">
                  <button 
                    type="button" 
                    onClick={() => setExibirFaturamentoGeral(true)}
                    className="bg-zinc-950 hover:bg-zinc-800 active:scale-95 border border-zinc-800 text-emerald-400 font-black px-5 py-3 rounded-2xl text-[11px] uppercase tracking-wider shadow-md transition-all"
                  >
                    🧮 Calcular Faturamento Acumulado Geral
                  </button>
                </div>
              </div>

              {historicoCaixas.length === 0 ? (
                <div className="text-center py-6 text-zinc-500">Nenhum fechamento registrado no histórico de caixas até o momento.</div>
              ) : (
                <div className="space-y-3">
                  {historicoCaixas.map((caixa) => (
                    <div key={caixa.id} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase block font-bold">Data/Hora</span>
                        <span className="font-black text-zinc-300 text-[10px]">{caixa.data}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase block font-bold">Entradas Pix</span>
                        <span className="font-bold text-teal-400">R$ {caixa.totalPix.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase block font-bold">Entradas Dinheiro</span>
                        <span className="font-bold text-amber-500">R$ {caixa.totalDinheiro.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase block font-bold">❌ Despesas</span>
                        <span className="font-bold text-red-400">R$ {caixa.despesas.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-emerald-400 uppercase block font-bold">Saldo Líquido</span>
                        <span className="font-black text-emerald-400 text-sm">R$ {caixa.saldoLiquido.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* GAVETA RETRÁTIL DA ZONA DE RISCO */}
            <div className="border border-red-950/40 rounded-3xl overflow-hidden transition-all duration-300">
              <button 
                type="button"
                onClick={() => setExpandirZonaPerigo(!expandirZonaPerigo)}
                className="w-full bg-red-950/10 hover:bg-red-950/20 px-6 py-4 flex justify-between items-center text-xs font-black uppercase text-red-400 tracking-wider transition-all"
              >
                <span>⚠️ Zona de Risco Avançada</span>
                <span>{expandirZonaPerigo ? "Fechar ▲" : "Expandir ▼"}</span>
              </button>
              
              {expandirZonaPerigo && (
                <div className="bg-red-950/5 p-6 border-t border-red-950/30 text-center space-y-3 animate-fade-in">
                  <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                    A ação abaixo apagará de forma **permanente** todo o histórico de faturamento e vendas.
                  </p>
                  <div className="flex justify-center">
                    <button onClick={() => setModalConfirmarReset(true)} className="bg-red-900/80 hover:bg-red-900 border border-red-700 text-red-100 font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md">
                      💥 Zerar Absolutamente Todo o Sistema
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ================= ABA: PEDIDO AVULSO ================= */}
        {abaAtiva === "avulso" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl relative">
              {!lojaAberta && (
                <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-3xl z-40 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <span className="text-3xl">🔒</span>
                  <h3 className="font-black text-red-400 text-sm uppercase tracking-wider">Lançamentos Bloqueados</h3>
                  <p className="text-xs text-zinc-400 max-w-xs">Ligue a chave de recepção de pedidos no topo da página para habilitar o balcão avulso.</p>
                </div>
              )}
              <h2 className="text-sm font-black text-orange-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Registrar Pedido</h2>
              <form onSubmit={preVisualizarPedidoAvulso} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Nome do Cliente</label>
                  <input type="text" required placeholder="Ex: Balcão João" value={nomeAvulso} onChange={(e) => setNomeAvulso(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Endereço / Obs</label>
                  <input type="text" placeholder="Retirada no Balcão" value={enderecoAvulso} onChange={(e) => setEnderecoAvulso(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none" />
                </div>
                <div className="relative" ref={dropdownRef}>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Horário</label>
                  <button type="button" onClick={() => setListaHorariosAberta(!listaHorariosAberta)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-white text-left flex justify-between items-center">
                    <span>⏱ {horarioAvulso}</span>
                  </button>
                  {listaHorariosAberta && (
                    <div className="absolute left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto p-1 space-y-0.5">
                      {OPCOES_HORARIOS.map((hora) => (
                        <button key={hora} type="button" onClick={() => { setHorarioAvulso(hora); setListaHorariosAberta(false); }} className={`w-full text-left p-2 rounded-lg text-xs font-bold ${horarioAvulso === hora ? "bg-orange-500 text-white" : "hover:bg-zinc-950 text-zinc-300"}`}>{hora}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/60">
                  {Object.keys(itensAvulsos).map((itemKey) => (
                    <div key={itemKey} className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg text-xs">
                      <span className="font-bold text-zinc-300">{formatarNomeItem(itemKey)}</span>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => alterarQtdAvulso(itemKey, -1)} className="w-6 h-6 bg-zinc-950 rounded border text-zinc-400 font-bold">-</button>
                        <span className="font-black text-white w-4 text-center">{(itensAvulsos as any)[itemKey]}</span>
                        <button type="button" onClick={() => alterarQtdAvulso(itemKey, 1)} className="w-6 h-6 bg-zinc-950 rounded border text-zinc-400 font-bold">+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Forma de Pagamento</label>
                  <select value={pagamentoAvulso} onChange={(e) => setPagamentoAvulso(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-white">
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>

                {pagamentoAvulso === "Dinheiro" && (
                  <div className="p-3 bg-zinc-950 rounded-2xl border border-amber-500/20 animate-fade-in text-xs space-y-2">
                    <label className="text-[10px] font-bold text-amber-400 uppercase block">Valor Recebido do Cliente</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 50.00" 
                      value={trocoParaAvulso} 
                      onChange={(e) => setTrocoParaAvulso(e.target.value)} 
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl p-2.5 text-xs text-white outline-none" 
                    />
                    {trocoAvulsoCalculado > 0 && (
                      <p className="text-[11px] text-emerald-400 font-black mt-1">Troco para devolver: R$ {trocoAvulsoCalculado.toFixed(2)}</p>
                    )}
                  </div>
                )}
              </form>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl sticky top-4 text-xs">
              <h2 className="text-xs font-black text-orange-400 uppercase tracking-widest border-b border-zinc-800 pb-2">🔎 Conferência do Pedido</h2>
              <div className="flex justify-between font-black text-white"><span>Total Geral</span><p className="text-2xl text-emerald-400">R$ {valorTotalAvulso}</p></div>
              <button onClick={preVisualizarPedidoAvulso} disabled={valorTotalAvulsoNumerico === 0 || !nomeAvulso.trim() || !lojaAberta} className="w-full px-6 py-3.5 rounded-2xl font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white transition-all shadow-md">Avançar →</button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}