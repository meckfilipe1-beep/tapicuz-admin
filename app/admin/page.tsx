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

const PRECODES_PRODUTOS: { [key: string]: number } = {
  tapiocaMolhada: 8.00,
  tapiocaManteiga: 6.00,
  tapiocaQueijo: 8.00,
  tapiocaOvo: 7.00,
  tapiocaQueijoOvo: 9.50,
  cuscuzMilho: 5.00,
  cuscuzArroz: 6.00,
  cafe: 4.00
}

const OPCOES_HORARIOS = [
  "0:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", 
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
    tapiocaManteiga: "🧈 Tapioca com Manteiga",
    tapiocaQueijo: "🧀 Tapioca com Queijo",
    tapiocaOvo: "🥚 Tapioca com Ovo",
    tapiocaQueijoOvo: "🧀🥚 Tapioca Queijo e Ovo",
    cuscuzMilho: "🌽 Cuscuz de Milho",
    cuscuzArroz: "🍚 Cuscuz de Arroz",
    cafe: "☕ Café"
  }
  return nomes[nomeChave] || nomeChave
}

interface Pedido {
  id: string
  nome: string
  endereco: string
  observacao?: string
  pagamento: string
  troco: number
  valorTotal: number
  horario: string
  pago: boolean
  concluido: boolean
  statusPagamento?: "pendente" | "pago"
  dataCriacao?: any
  itens: {
    tapiocaMolhada: number
    tapiocaManteiga: number
    tapiocaQueijo: number
    tapiocaOvo: number
    tapiocaQueijoOvo: number
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
  const [abaAtiva, setAbaAtiva] = useState<"pedidos" | "avulso" | "historico" | "caixa" | "pendencias" | "zerar">("pedidos")
  const [lojaAberta, setLojaAberta] = useState<boolean>(true)

  const [notificacaoCaixa, setNotificacaoCaixa] = useState<string | null>(null)
  const [mostrarModalCopiado, setMostrarModalCopiado] = useState(false)
  const [pedidoSelecionadoParaConcluir, setPedidoSelecionadoParaConcluir] = useState<Pedido | null>(null)
  const [mostrarResumoFinalAvulso, setMostrarResumoFinalAvulso] = useState(false)
  const [pedidoDetalhado, setPedidoDetalhado] = useState<Pedido | null>(null)
  const [mostrarDemandas, setMostrarDemandas] = useState(false)
  const [mostrarDropdownHora, setMostrarDropdownHora] = useState(false)
  
  const [modalConfirmarTurno, setModalConfirmarTurno] = useState(false)
  const [modalConfirmarZerarTudo, setModalConfirmarZerarTudo] = useState(false)

  const [valorDespesaInput, setValorDespesaInput] = useState("")
  const [totalDespesasAcumuladas, setTotalDespesasAcumuladas] = useState(0)

  const [nomeAvulso, setNomeAvulso] = useState("")
  const [ruaAvulso, setRuaAvulso] = useState("")
  const [numeroAvulso, setNumeroAvulso] = useState("")
  const [referenciaAvulso, setReferenciaAvulso] = useState("")
  const [observacaoAvulso, setObservacaoAvulso] = useState("")
  const [pagamentoAvulso, setPagamentoAvulso] = useState<"Pix" | "Dinheiro">("Pix")
  const [trocoParaAvulso, setTrocoParaAvulso] = useState("")
  const [horarioAvulso, setHorarioAvulso] = useState("0:00")
  const [valorTotalAvulso, setValorTotalAvulso] = useState("0.00")
  const [criandoAvulso, setCriandoAvulso] = useState(false)

  const [itensAvulsos, setItensAvulsos] = useState({
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    tapiocaOvo: 0,
    tapiocaQueijoOvo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cafe: 0,
  })

  // Guardando a quantidade anterior na referência (NÃO causa re-render)
  const ultimoTotalPedidos = useRef(0)

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

      // 🔊 DETECTOR DE NOVO PEDIDO
      const pedidosAtivosAtuais = listaPedidos.filter(p => !p.concluido).length
      
      if (ultimoTotalPedidos.current > 0 && pedidosAtivosAtuais > ultimoTotalPedidos.current) {
        const audio = new Audio("/pedido.mp3")
        
        audio.play().catch((erro) => {
          console.log(
            "Áudio bloqueado pelo navegador. Clique na página para ativar o som dos pedidos! 🔊", 
            erro
          )
        })
      }

      // Atualiza a referência com o total atual de pedidos ativos
      ultimoTotalPedidos.current = pedidosAtivosAtuais

      setPedidos(listaPedidos)
      setCarregando(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let subtotal = 0
    let qtdComidas = 0
    let qtdCafes = itensAvulsos.cafe

    Object.entries(itensAvulsos).forEach(([key, qtd]) => {
      subtotal += (PRECODES_PRODUTOS[key] || 0) * qtd
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
            const descontoPorPar = (PRECODES_PRODUTOS[key] + PRECODES_PRODUTOS.cafe) - 10.00
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

  const partesEndereco = []
  if (ruaAvulso.trim()) partesEndereco.push(ruaAvulso.trim())
  if (numeroAvulso.trim()) partesEndereco.push(`Nº ${numeroAvulso.trim()}`)
  if (referenciaAvulso.trim()) partesEndereco.push(`Ref: ${referenciaAvulso.trim()}`)
  const enderecoCompletoConstruido = partesEndereco.length > 0 ? partesEndereco.join(", ") : "Retirada no Balcão"

  function executarCopiaResumo() {
    const itensTxt = Object.entries(itensAvulsos)
      .filter(([_, qtd]) => qtd > 0)
      .map(([key, qtd]) => `• ${qtd}x ${formatarNomeItem(key)}`)
      .join("\n")

    const textoFinal = `━━━━━━━━━━━━━━━━━━\n☕ TAPICUZ\n\nCliente: ${nomeAvulso || "Não informado"}\nHorário: ${horarioAvulso}\n\n📍 Entrega:\n${enderecoCompletoConstruido}\n\n🛒 Itens:\n${itensTxt || "Nenhum item selecionado"}\n\n💳 Pagamento:\n${pagamentoAvulso.toUpperCase()}\n\n💰 Total:\nR$ ${valorTotalAvulso}\n━━━━━━━━━━━━━━━━━━`
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textoFinal)
        .then(() => {
          setMostrarModalCopiado(true)
        })
        .catch(err => {
          console.error("Erro na API clipboard, tentando fallback estrutural", err)
        })
    } else {
      const textArea = document.createElement("textarea")
      textArea.value = textoFinal
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setMostrarModalCopiado(true)
    }
  }

  function gerarResumoPedidoWhatsApp() {
    const itens = Object.entries(itensAvulsos)
      .filter(([_, qtd]) => qtd > 0)
      .map(([key, qtd]) => `• ${qtd}x ${formatarNomeItem(key)}`)
      .join("\n")

    return `━━━━━━━━━━━━━━━━━━\n☕ TAPICUZ\n\nCliente: ${nomeAvulso || "Não informado"}\nHorário: ${horarioAvulso}\n\n📍 Entrega:\n${enderecoCompletoConstruido}\n\n🛒 Itens:\n${itens || "Nenhum item selecionado"}\n\n💳 Pagamento:\n${pagamentoAvulso.toUpperCase()}\n\n💰 Total:\nR$ ${valorTotalAvulso}\n━━━━━━━━━━━━━━━━━━`
  }

  const enviarMensagemNotificacaoWhats = (nomeCliente: string) => {
    const msg = `Olá, ${nomeCliente}! ☕\nSeu pedido da Tapicuz já foi entregue.\nCaso o pagamento ainda não tenha sido realizado, pedimos a gentileza de efetuá-lo assim que possível.\nSe o pagamento já foi realizado, desconsidere esta mensagem e muito obrigado pela preferência! ❤️\nTenha um excelente dia.`
    const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`
    window.open(url, "_blank")
  }

  function alterarQtdAvulso(campo: string, valor: number) {
    setItensAvulsos(prev => ({
      ...prev,
      [campo]: Math.max(0, (prev as any)[campo] + valor)
    }))
  }

  async function processarDecisaoPedidoExistente(foiPago: boolean) {
    if (!pedidoSelecionadoParaConcluir) return
    try {
      await updateDoc(doc(db, "pedidos", pedidoSelecionadoParaConcluir.id), {
        concluido: true,
        statusPagamento: foiPago ? "pago" : "pendente"
      })
      setNotificacaoCaixa(foiPago ? "🟢 PEDIDO CONCLUÍDO E PAGO!" : "🔴 MOVIDO PARA AS PENDÊNCIAS!")
      setTimeout(() => setNotificacaoCaixa(null), 2000)
      setPedidoSelecionadoParaConcluir(null)
    } catch (erro) {
      console.error(erro)
    }
  }

  async function marcarComoPago(id: string) {
    try {
      await updateDoc(doc(db, "pedidos", id), {
        concluido: true,
        statusPagamento: "pago"
      })
      setNotificacaoCaixa("🟢 PEDIDO MARCADO COMO PAGO!")
      setTimeout(() => setNotificacaoCaixa(null), 2000)
      if (pedidoDetalhado?.id === id) setPedidoDetalhado(null)
    } catch (erro) {
      console.error(erro)
    }
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
      setNotificacaoCaixa(`Pedidos: ${novoStatus ? "SISTEMA ON" : "SISTEMA OFF"}`)
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
      setModalConfirmarTurno(false)
      setNotificacaoCaixa("Turno arquivado com sucesso!")
      setTimeout(() => setNotificacaoCaixa(null), 4000)
    } catch (error) {
      console.error("Erro ao fechar turno:", error)
    }
  }

  async function apagarSistemaGeralEZero() {
    try {
      const snapPedidos = await getDocs(collection(db, "pedidos"))
      const promessasDelecao = snapPedidos.docs.map(d => deleteDoc(doc(db, "pedidos", d.id)))
      await Promise.all(promessasDelecao)
      
      await setDoc(doc(db, "configuracoes", "loja"), { despesas: 0, aberta: true }, { merge: true })
      
      setTotalDespesasAcumuladas(0)
      setModalConfirmarZerarTudo(false)
      setAbaAtiva("pedidos")
      setNotificacaoCaixa("💥 SISTEMA RESETADO E APAGADO COMPLETAMENTE!")
      setTimeout(() => setNotificacaoCaixa(null), 4000)
    } catch (error) {
      console.error("Erro ao zerar tudo:", error)
    }
  }

  function dispararFluxoConclusaoAvulso(e: any) {
    e.preventDefault()
    if (!nomeAvulso.trim() || valorTotalAvulsoNumerico === 0 || !lojaAberta) return
    setMostrarResumoFinalAvulso(true)
  }

  async function finalizarPedidoAvulsoComStatusRoteado(destino: "pago" | "espera" | "pendente") {
    if (criandoAvulso || !lojaAberta) return
    setCriandoAvulso(true)

    const novoPedidoAvulso: any = {
      nome: nomeAvulso.trim().toUpperCase(),
      endereco: enderecoCompletoConstruido.toUpperCase(),
      pagamento: pagamentoAvulso,
      troco: destino === "pago" ? trocoAvulsoCalculado : 0,
      valorTotal: valorTotalAvulsoNumerico,
      horario: horarioAvulso,
      pago: destino === "pago",
      concluido: destino !== "espera", 
      statusPagamento: destino === "pago" ? "pago" : "pendente", 
      dataCriacao: new Date().toISOString(),
      itens: itensAvulsos
    }

    if (observacaoAvulso.trim()) {
      novoPedidoAvulso.observacao = observacaoAvulso.trim().toUpperCase()
    }

    try {
      await addDoc(collection(db, "pedidos"), novoPedidoAvulso)
      setNomeAvulso("")
      setRuaAvulso("")
      setNumeroAvulso("")
      setReferenciaAvulso("")
      setObservacaoAvulso("")
      setPagamentoAvulso("Pix")
      setTrocoParaAvulso("")
      setItensAvulsos({ tapiocaMolhada:0, tapiocaManteiga:0, tapiocaQueijo:0, tapiocaOvo:0, tapiocaQueijoOvo:0, cuscuzMilho:0, cuscuzArroz:0, cafe:0 })
      setMostrarResumoFinalAvulso(false)
      
      setNotificacaoCaixa("Pedido processado com sucesso! 🎉")
      setTimeout(() => setNotificacaoCaixa(null), 3500)
      
      if (destino === "pago") setAbaAtiva("historico")
      else if (destino === "espera") setAbaAtiva("pedidos")
      else setAbaAtiva("pendencias")
    } catch (error) {
      console.error(error)
    } finally {
      setCriandoAvulso(false)
    }
  }

  const pedidosAtivos = pedidos.filter(p => !p.concluido)
  const pedidosPendentes = pedidos.filter(p => p.concluido && p.statusPagamento === "pendente")
  const pedidosPagos = pedidos.filter(p => p.concluido && p.statusPagamento === "pago")

  const faturamentoTotal = pedidosPagos.reduce((acc, p) => acc + p.valorTotal, 0)
  const totalPix = pedidosPagos.filter(p => p.pagamento === "Pix").reduce((acc, p) => acc + p.valorTotal, 0)
  const totalDinheiro = pedidosPagos.filter(p => p.pagamento === "Dinheiro").reduce((acc, p) => acc + p.valorTotal, 0)
  
  const saldoLiquidoAtual = faturamentoTotal - totalDespesasAcumuladas

  const somaHistoricoPix = historicoCaixas.reduce((acc, c) => acc + (c.totalPix || 0), 0)
  const somaHistoricoDinheiro = historicoCaixas.reduce((acc, c) => acc + (c.totalDinheiro || 0), 0)
  const somaHistoricoDespesas = historicoCaixas.reduce((acc, c) => acc + (c.despesas || 0), 0)
  const somaHistoricoLiquido = historicoCaixas.reduce((acc, c) => acc + (c.saldoLiquido || 0), 0)

  const demandasProducao = {
    tapiocaMolhada: 0,
    tapiocaManteiga: 0,
    tapiocaQueijo: 0,
    tapiocaOvo: 0,
    tapiocaQueijoOvo: 0,
    cuscuzMilho: 0,
    cuscuzArroz: 0,
    cafe: 0,
  }

  pedidosAtivos.forEach((pedido) => {
    Object.keys(demandasProducao).forEach((item) => {
      demandasProducao[item as keyof typeof demandasProducao] +=
        pedido.itens?.[item as keyof typeof pedido.itens] || 0
    })
  })

  return (
    <main className="min-h-screen bg-zinc-950 p-4 sm:p-8 text-zinc-100 relative tracking-wide font-sans">
      
      {/* ================= NOTIFICADOR FLUTUANTE DE TOPO ================= */}
      {notificacaoCaixa && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] animate-bounce">
          <span className="text-xs font-black text-black bg-yellow-400 border-2 border-yellow-300 shadow-2xl px-8 py-3.5 rounded-2xl tracking-widest uppercase block text-center">
            {notificacaoCaixa}
          </span>
        </div>
      )}

      {/* ================= MODAL EXPLICATIVO DE SUCESSO DE CÓPIA ================= */}
      {mostrarModalCopiado && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-emerald-400 w-full max-w-xs rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-fade-in">
            <span className="text-4xl block animate-bounce">📋</span>
            <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest">RESUMO COPIADO WITH SUCCESS!</h3>
            <p className="text-zinc-400 text-xs uppercase font-bold leading-relaxed">O texto do cliente foi armazenado com sucesso na memória do dispositivo. Pode abrir o WhatsApp e colar!</p>
            <button 
              onClick={() => setMostrarModalCopiado(false)}
              className="w-full py-2.5 bg-emerald-400 hover:bg-emerald-500 text-black font-black text-xs uppercase rounded-xl transition-all"
            >
              Confirmado 👌
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIGURAÇÃO MÁXIMA DE FORÇAR RESET GERAL ================= */}
      {modalConfirmarZerarTudo && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-red-500 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl text-center">
            <div className="space-y-1">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-sm font-black text-red-500 tracking-wider uppercase">VOCÊ TEM CERTEZA ABSOLUTA?</h2>
              <p className="text-zinc-400 text-xs uppercase font-bold">Isso irá apagar todos os pedidos ativos, pendentes e o histórico do turno atual imediatamente sem salvar nada!</p>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button 
                onClick={apagarSistemaGeralEZero} 
                className="py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg"
              >
                💥 APAGAR E ZERAR TUDO AGORA
              </button>
              <button 
                onClick={() => setModalConfirmarZerarTudo(false)} 
                className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-bold text-xs uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE DECISÃO: CONCLUIR PEDIDO EXISTENTE ================= */}
      {pedidoSelecionadoParaConcluir && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl text-center">
            <div className="space-y-1">
              <span className="text-xl">💰</span>
              <h2 className="text-sm font-black text-orange-400 tracking-wider uppercase">O PEDIDO DE {pedidoSelecionadoParaConcluir.nome} JÁ FOI PAGO?</h2>
              <p className="text-zinc-400 text-xs">Selecione o status de pagamento para arquivar.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button 
                onClick={() => processarDecisaoPedidoExistente(true)} 
                className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                🟢 Sim, foi pago! (Ir para Vendas)
              </button>
              <button 
                onClick={() => processarDecisaoPedidoExistente(false)} 
                className="py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                🔴 Não foi pago! (Ir para Pendências)
              </button>
              <button 
                onClick={() => setPedidoSelecionadoParaConcluir(null)} 
                className="py-2.5 mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-bold text-xs uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: FLUXO DE ROTEAMENTO TRIPLO DO AVULSO ================= */}
      {mostrarResumoFinalAvulso && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl text-center">
            <div className="space-y-1">
              <span className="text-xl">⚡</span>
              <h2 className="text-sm font-black text-orange-400 tracking-wider uppercase">ONDE DESEJA LANÇAR ESTE PEDIDO?</h2>
              <p className="text-zinc-400 text-[11px]">Escolha a destinação correta para manter a organização.</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 pt-2">
              <button 
                onClick={() => finalizarPedidoAvulsoComStatusRoteado("pago")} 
                disabled={criandoAvulso} 
                className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                🟢 PEDIDO PAGO (IR DIRETO P/ SOMA)
              </button>
              <button 
                onClick={() => finalizarPedidoAvulsoComStatusRoteado("espera")} 
                disabled={criandoAvulso} 
                className="py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                🟡 MANDAR P/ FILA DE ESPERA (PRODUÇÃO)
              </button>
              <button 
                onClick={() => finalizarPedidoAvulsoComStatusRoteado("pendente")} 
                disabled={criandoAvulso} 
                className="py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                🔴 VALOR NÃO PAGO (IR P/ PENDÊNCIAS)
              </button>
              <button 
                onClick={() => setMostrarResumoFinalAvulso(false)} 
                className="py-2.5 mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-bold text-xs uppercase"
              >
                ← Voltar e Ajustar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE FECHAMENTO CHAVE COFRE ================= */}
      {modalConfirmarTurno && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 text-center space-y-4 shadow-2xl text-xs">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-lg mx-auto font-bold">🗂️</div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-zinc-200 uppercase tracking-wide">RESUMO DO TURNO</h3>
            </div>
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-left space-y-2 uppercase">
              <div className="flex justify-between text-zinc-400"><span>PIX LIQUIDADO:</span><span className="font-bold text-teal-400">R$ {totalPix.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>DINHEIRO:</span><span className="font-bold text-amber-500">R$ {totalDinheiro.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>DESPESAS:</span><span className="font-bold text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</span></div>
              <div className="flex justify-between text-white border-t border-zinc-900 pt-2 font-black mt-1">
                <span>SALDO LÍQUIDO:</span>
                <span className="text-emerald-400 text-sm">R$ {saldoLiquidoAtual.toFixed(2)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setModalConfirmarTurno(false)} className="py-3 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-xl text-zinc-300 uppercase">VOLTAR</button>
              <button type="button" onClick={executarFechamentoTurno} className="py-3 bg-gradient-to-r from-orange-600 to-amber-600 font-black rounded-xl text-white uppercase transition-all">CONFIRMAR & FECHAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DETALHES DO PEDIDO ================= */}
      {pedidoDetalhado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl text-xs uppercase">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-black tracking-wider text-orange-400">RESUMO COMPLETO DO PEDIDO</h2>
              <button onClick={() => setPedidoDetalhado(null)} className="w-7 h-7 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 text-sm font-bold">✕</button>
            </div>
            <div className="space-y-2.5 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">CLIENTE:</span><span className="font-black text-white text-sm">{pedidoDetalhado.nome}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">HORÁRIO:</span><span className="font-black text-amber-400">⏱ {pedidoDetalhado.horario}</span></div>
              <div className="flex flex-col gap-0.5 border-t border-zinc-800/40 pt-1.5"><span className="text-zinc-500 font-bold">LOCAL DE ENTREGA:</span><span className="font-bold text-zinc-300">{pedidoDetalhado.endereco}</span></div>
              {pedidoDetalhado.observacao && (
                <div className="mt-1 bg-zinc-900 p-2.5 border border-zinc-800 rounded-xl">
                  <span className="text-orange-400 font-bold block text-[10px]">OBSERVAÇÃO:</span>
                  <span className="text-zinc-300 font-black">{pedidoDetalhado.observacao}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-800/50 pt-2">
                <span className="text-zinc-500 font-bold">MÉTODO DE PAGAMENTO:</span>
                <span className="font-black text-zinc-200">{pedidoDetalhado.pagamento.toUpperCase()}</span>
              </div>
            </div>
            
            <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/60">
              <span className="text-[9px] font-black text-zinc-500 block mb-1 tracking-wider text-center">PRODUTOS SOLICITADOS</span>
              {Object.entries(pedidoDetalhado.itens || {}).map(([key, qtd]) => qtd > 0 && (
                <div key={key} className="flex justify-between text-zinc-300 border-b border-zinc-900 pb-1">
                  <span>{formatarNomeItem(key)}</span>
                  <span className="font-black text-orange-400">{qtd}X</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-emerald-500/10">
              <span className="text-[10px] font-bold text-zinc-400">VALOR TOTAL DO PEDIDO</span>
              <p className="text-xl font-black text-emerald-400">R$ {pedidoDetalhado.valorTotal.toFixed(2)}</p>
            </div>
            <div className="pt-2 flex gap-2">
              <button onClick={() => setPedidoDetalhado(null)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold">FECHAR RESUMO</button>
              <button onClick={() => { if(confirm("Deseja deletar este registro permanentemente?")) deletarDoHistorico(pedidoDetalhado.id) }} className="px-4 py-3 bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl font-bold">🗑️</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* ================= TOPBAR ABAS ================= */}
        <div className="flex flex-col gap-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl uppercase">
          <div className="flex flex-row justify-between items-center w-full">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 tracking-tight">TAPICUZ ADMIN ☀️</h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 font-bold">PAINEL DE CONTROLE DE ENTRADAS</p>
            </div>
            <div className="flex items-center gap-3 bg-zinc-950/60 border border-zinc-800/80 py-2 px-4 rounded-2xl">
              <span className={`text-[10px] font-black tracking-wider hidden sm:inline ${lojaAberta ? "text-emerald-400" : "text-zinc-500"}`}>
                {lojaAberta ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
              </span>
              <button 
                type="button"
                onClick={alternarStatusLoja}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 ${lojaAberta ? "bg-emerald-500" : "bg-zinc-800"}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-300 ${lojaAberta ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 w-full">
            <button onClick={() => setAbaAtiva("pedidos")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "pedidos" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">📋</span>
              <span>Pedidos ({pedidosAtivos.length})</span>
            </button>
            <button onClick={() => setAbaAtiva("avulso")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "avulso" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">➕</span>
              <span>LANÇAR AVULSO</span>
            </button>
            <button onClick={() => setAbaAtiva("pendencias")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "pendencias" ? "bg-red-900 text-white border-red-500 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">⏳</span>
              <span>PENDÊNCIAS ({pedidosPendentes.length})</span>
            </button>
            <button onClick={() => setAbaAtiva("historico")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "historico" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">📜</span>
              <span>VENDAS PAGAS ({pedidosPagos.length})</span>
            </button>
            <button onClick={() => setAbaAtiva("caixa")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "caixa" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">💰</span>
              <span>CAIXA GERAL</span>
            </button>
            <button onClick={() => setModalConfirmarZerarTudo(true)} className="p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all bg-zinc-950 border-red-800 text-red-500 hover:bg-red-950/20">
              <span className="text-lg">🚨</span>
              <span>ZERAR SISTEMA</span>
            </button>
          </div>
        </div>

        {/* ================= ABA: PEDIDOS ATIVOS ================= */}
        {abaAtiva === "pedidos" && (
          <div className="space-y-6 animate-fade-in uppercase">
            {pedidosAtivos.length > 0 && (
              <div className="max-w-xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl text-center">
                <button 
                  type="button"
                  onClick={() => setMostrarDemandas(!mostrarDemandas)}
                  className="w-full text-sm font-black text-orange-400 tracking-wider flex items-center justify-center gap-2 py-1"
                >
                  👩‍🍳 INSUMOS PARA PREPARO IMEDIATO {mostrarDemandas ? "▲" : "▼"}
                </button>
                {mostrarDemandas && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-4 border-t border-zinc-800 pt-4">
                    {Object.entries(demandasProducao)
                      .filter(([_, qtd]) => qtd > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([item, qtd]) => (
                        <div key={item} className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800/40 font-black">
                          <span className="text-zinc-300 w-full text-center">{formatarNomeItem(item)}</span>
                          <span className="text-lg font-black text-orange-400 bg-zinc-900/80 border border-zinc-800 px-3 py-0.5 rounded-lg">{qtd}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {carregando ? (
              <div className="text-center py-12 text-zinc-500 text-xs animate-pulse">SINCRONIZANDO BANCO...</div>
            ) : pedidosAtivos.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800 border-dashed rounded-3xl text-zinc-500 text-xs font-bold">NENHUM PEDIDO ATIVO NO MOMENTO.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {pedidosAtivos.map((pedido) => {
                  const estaSendoConcluido = pedidoSelecionadoParaConcluir?.id === pedido.id
                  return (
                    <div 
                      key={pedido.id} 
                      className={`border text-zinc-100 rounded-3xl p-5 space-y-4 shadow-xl flex flex-col justify-between transition-all duration-300 ${
                        estaSendoConcluido 
                          ? "bg-emerald-950 border-emerald-400 scale-[1.01] shadow-emerald-900/20" 
                          : "bg-zinc-900 border-zinc-800"
                      }`}
                    >
                      <div>
                        <div className={`border rounded-2xl py-2 px-4 flex items-center justify-center ${estaSendoConcluido ? "bg-black/30 border-emerald-500/30" : "bg-black/50 border border-zinc-800"}`}>
                          <span className={`text-lg font-black tracking-wider ${estaSendoConcluido ? "text-emerald-400 animate-pulse" : "text-orange-400"}`}>
                            {estaSendoConcluido ? "✓ CONCLUINDO..." : `⏱️ ${pedido.horario}`}
                          </span>
                        </div>
                        <div className={`border-b pb-2.5 text-center space-y-2 mt-2 uppercase ${estaSendoConcluido ? "border-emerald-800/40" : "border-zinc-800/60"}`}>
                          <div>
                            <span className={`text-[9px] font-bold block mb-0.5 ${estaSendoConcluido ? "text-emerald-400/70" : "text-zinc-500"}`}>CLIENTE</span>
                            <h3 className="font-black text-white text-base tracking-tight">{pedido.nome}</h3>
                          </div>
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className={`text-[9px] font-bold block ${estaSendoConcluido ? "text-emerald-400/70" : "text-zinc-500"}`}>LOGRADOURO</span>
                            <span className={`text-xs font-black tracking-wide py-1.5 px-3 rounded-xl border inline-block text-center max-w-full truncate ${
                              estaSendoConcluido 
                                ? "text-emerald-300 bg-emerald-400/5 border-emerald-500/20" 
                                : "text-yellow-400 bg-yellow-400/5 border-yellow-400/10"
                            }`}>
                              📍 {pedido.endereco}
                            </span>
                          </div>
                          {pedido.observacao && (
                            <div className={`border rounded-xl p-3 text-center ${estaSendoConcluido ? "bg-emerald-900/30 border-emerald-500/20" : "bg-orange-500/10 border border-orange-500/20"}`}>
                              <p className={`text-[10px] font-black mb-1 ${estaSendoConcluido ? "text-emerald-400" : "text-orange-400"}`}>REQUISITO</p>
                              <p className="text-xs text-zinc-200 font-black">{pedido.observacao}</p>
                            </div>
                          )}
                        </div>
                        <div className={`p-3 rounded-xl border text-xs text-center mt-3 ${estaSendoConcluido ? "bg-black/10 border-emerald-800/30" : "bg-black/20 border border-zinc-800/60"}`}>
                          <span className={`text-[9px] font-bold block mb-1 uppercase ${estaSendoConcluido ? "text-emerald-400/60" : "text-zinc-500"}`}>COMPOSIÇÃO</span>
                          {Object.entries(pedido.itens || {}).map(([key, qtd]) => qtd > 0 && (
                            <div key={key} className="flex justify-center items-center text-zinc-100 font-black">
                              <span><strong className={`${estaSendoConcluido ? "text-emerald-400" : "text-amber-300"} mr-1`}>{qtd}X</strong> {formatarNomeItem(key)}</span>
                            </div>
                          ))}
                        </div>
                        <div className={`p-3 rounded-xl border flex justify-between items-center text-xs mt-3 uppercase ${estaSendoConcluido ? "bg-black/20 border-emerald-800/40" : "bg-black/40 border border-zinc-800"}`}>
                          <div>
                            <span className={`font-bold text-[9px] block ${estaSendoConcluido ? "text-emerald-400/60" : "text-zinc-400"}`}>ESCOLHA</span>
                            <span className="font-black text-zinc-200 text-[11px]">{pedido.pagamento}</span>
                            {pedido.pagamento === "Dinheiro" && pedido.troco > 0 && (
                              <span className="font-black text-red-400 block mt-0.5 text-xs">TROCO: R$ {pedido.troco.toFixed(2)}</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`font-bold text-[9px] block ${estaSendoConcluido ? "text-emerald-400/60" : "text-zinc-400"}`}>SUBTOTAL</span>
                            <span className={`text-base font-black ${estaSendoConcluido ? "text-emerald-300" : "text-emerald-400"}`}>R$ {pedido.valorTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-3">
                        <button 
                          onClick={() => setPedidoSelecionadoParaConcluir(pedido)} 
                          className={`w-full py-3.5 rounded-xl font-black text-xs text-white tracking-widest uppercase shadow-md transition-all ${
                            estaSendoConcluido 
                              ? "bg-emerald-500 hover:bg-emerald-600 animate-pulse" 
                              : "bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-95"
                          }`}
                        >
                          {estaSendoConcluido ? "✓ DEFINIR DESTINO" : "➡️ Concluir"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA: PENDÊNCIAS ================= */}
        {abaAtiva === "pendencias" && (
          <div className="space-y-6 animate-fade-in uppercase">
            <div className="text-center bg-zinc-900 border-2 border-red-900/30 rounded-3xl p-6 shadow-xl max-w-lg mx-auto">
              <span className="text-2xl">⏳</span>
              <h2 className="text-sm font-black text-red-400 tracking-widest mt-1">SALA DE AGUARDO DE TRANSFERÊNCIAS</h2>
              <p className="text-zinc-400 text-[11px] mt-1 font-medium">PEDIDOS ENTREGUES MAS COM RECEBIMENTO NÃO CONFIRMADO NO BANCO.</p>
            </div>
            {pedidosPendentes.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 border-dashed rounded-3xl text-zinc-500 text-xs font-bold tracking-wide">
                NENHUMA PENDÊNCIA REGISTRADA NO MOMENTO.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {pedidosPendentes.map((pedido) => (
                  <div key={pedido.id} className="border bg-zinc-900 border-red-950/40 text-zinc-100 rounded-3xl p-5 shadow-xl flex flex-col justify-between">
                    
                    <div className="bg-black/30 border border-zinc-800/60 rounded-2xl p-4 space-y-3.5 text-center">
                      <div className="border-t border-b border-zinc-800/60 pb-2">
                        <span className="text-red-400 font-black text-xs tracking-widest block animate-pulse">⚠️ AGUARDANDO PAGAMENTO</span>
                        <span className="font-mono text-[10px] font-black text-zinc-500 mt-0.5 block">HORÁRIO DE ENVIO: {pedido.horario}</span>
                      </div>
                      
                      <div>
                        <span className="text-[11px] font-black text-zinc-400 tracking-widest block mb-0.5">⚠️ CLIENTE ⚠️</span>
                        <h4 className="font-black text-white text-base tracking-wide">{pedido.nome}</h4>
                        <span className="text-[11px] text-amber-400 block font-semibold mt-1">📍 ENTREGA: {pedido.endereco}</span>
                      </div>
                      
                      <div className="border-t border-b border-zinc-800/40 py-2.5 text-xs text-zinc-300 font-bold space-y-0.5">
                        <span className="text-[9px] font-black text-zinc-500 block mb-1">PRODUTOS DO CLIENTE</span>
                        {Object.entries(pedido.itens || {}).map(([key, qtd]) => qtd > 0 && (
                          <div key={key}>• {qtd}x {formatarNomeItem(key)}</div>
                        ))}
                      </div>
                      
                      <div className="pt-1">
                        <span className="text-zinc-500 font-black text-[9px] tracking-wider block mb-0.5">MÉTODO PROPOSTO: {pedido.pagamento.toUpperCase()}</span>
                        <p className="text-[10px] font-bold text-zinc-400">VALOR DEVEDOR TOTAL:</p>
                        <span className="font-black text-red-500 text-xl tracking-tight">R$ {pedido.valorTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <button onClick={() => marcarComoPago(pedido.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-xs uppercase transition-all shadow-md">💰 Confirmar Pagamento</button>
                      <button onClick={() => enviarMensagemNotificacaoWhats(pedido.nome)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl font-bold text-[11px] uppercase transition-all border border-zinc-700">📱 Avisar Cliente</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA: HISTÓRICO DE PEDIDOS PAGOS ================= */}
        {abaAtiva === "historico" && (
          <div className="space-y-6 animate-fade-in uppercase">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl text-xs">
              <h2 className="text-sm font-black text-emerald-400 tracking-wider border-b border-zinc-800 pb-2 text-center">HISTÓRICO DE PEDIDOS PAGOS</h2>
              {pedidosPagos.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 font-bold">NENHUM FLUXO TOTALIZADO NESTE TURNO AINDA.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 font-bold">
                        <th className="pb-2">NOME DO CLIENTE</th>
                        <th className="pb-2">VALOR</th>
                        <th className="pb-2 text-center">VER RESUMO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosPagos.map((pedido) => (
                        <tr key={pedido.id} className="border-b border-zinc-800/30 hover:bg-zinc-950/20">
                          <td className="py-3 font-black text-zinc-200">{pedido.nome}</td>
                          <td className="py-3 font-black text-emerald-400">R$ {pedido.valorTotal.toFixed(2)}</td>
                          <td className="py-3 text-center">
                            <button 
                              onClick={() => setPedidoDetalhado(pedido)} 
                              className="bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-black px-4 py-1.5 rounded-xl text-[11px] border border-zinc-700/60 transition-all"
                            >
                              👁️ DETALHES
                            </button>
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

        {/* ================= CAIXA GERAL ================= */}
        {abaAtiva === "caixa" && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in uppercase">
            
            <div className="space-y-3">
              <h3 className="text-xs font-black text-orange-400 tracking-widest pl-2">📊 MOVIMENTAÇÃO DO TURNO ATUAL</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                  <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">PIX LIQUIDADO</span>
                  <p className="text-lg font-black text-teal-400">R$ {totalPix.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                  <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">DINHEIRO</span>
                  <p className="text-lg font-black text-amber-500">R$ {totalDinheiro.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-red-900/30 p-5 rounded-3xl space-y-1 shadow-xl">
                  <span className="text-[10px] font-bold text-red-400 tracking-widest block">DESPESAS</span>
                  <p className="text-lg font-black text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl bg-gradient-to-b from-zinc-900 to-zinc-950">
                  <span className="text-[10px] font-bold text-zinc-400 tracking-widest block">SALDO LÍQUIDO</span>
                  <p className="text-lg font-black text-white">R$ {saldoLiquidoAtual.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch pt-2">
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-red-400 tracking-wider mb-2">💸 LANÇAR DESPESA / RETIRADA</h3>
                </div>
                <form onSubmit={lancarDespesaSimples} className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    placeholder="VALOR R$ (EX: 15.50)" 
                    value={valorDespesaInput}
                    onChange={(e) => setValorDespesaInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded-xl p-3 text-xs text-white outline-none text-center font-bold" 
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-black px-6 rounded-xl text-xs tracking-wider transition-all">LANÇAR</button>
                </form>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center items-center text-center space-y-3">
                <button type="button" onClick={() => setModalConfirmarTurno(true)} className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs tracking-widest rounded-xl shadow-md">
                  💾 SALVAR & ARQUIVAR TURNO COMPLETO
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-zinc-900">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1">
                <h3 className="text-xs font-black text-emerald-400 tracking-widest">🗄️ HISTÓRICO DE TURNOS ARQUIVADOS</h3>
                <span className="text-[10px] text-zinc-500 font-bold">REGISTROS ANTERIORES NO BANCO</span>
              </div>

              <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 text-center shadow-xl space-y-3">
                <span className="text-[10px] font-black text-emerald-400 tracking-widest block">💰 SOMA TOTAL ACUMULADA DE RESUMOS</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs uppercase">
                  <div className="bg-black/40 p-2.5 rounded-xl border border-zinc-800/60">
                    <span className="text-[8px] text-zinc-500 block font-bold">TOTAL PIX</span>
                    <span className="font-black text-teal-400 text-xs">R$ {somaHistoricoPix.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/40 p-2.5 rounded-xl border border-zinc-800/60">
                    <span className="text-[8px] text-zinc-500 block font-bold">TOTAL DINHEIRO</span>
                    <span className="font-black text-amber-500 text-xs">R$ {somaHistoricoDinheiro.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/40 p-2.5 rounded-xl border border-zinc-800/60">
                    <span className="text-[8px] text-zinc-500 block font-bold">TOTAL DESPESAS</span>
                    <span className="font-black text-red-400 text-xs">R$ {somaHistoricoDespesas.toFixed(2)}</span>
                  </div>
                  <div className="bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-900/30">
                    <span className="text-[8px] text-emerald-400/70 block font-bold">LÍQUIDO GERAL</span>
                    <span className="font-black text-emerald-400 text-sm">R$ {somaHistoricoLiquido.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {historicoCaixas.length === 0 ? (
                <div className="text-center py-8 bg-zinc-900/20 border border-zinc-900 border-dashed rounded-2xl text-zinc-600 text-xs font-bold tracking-wide">
                  NENHUM FECHAMENTO SALVO NO BANCO AINDA.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {historicoCaixas.map((caixa) => (
                    <div key={caixa.id} className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-4 space-y-3 shadow-md text-xs">
                      <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                        <span className="font-black text-zinc-200">🗂️ TURNO SALVO</span>
                        <span className="font-mono text-[10px] font-black text-amber-400">⏱️ {caixa.data}</span>
                      </div>
                      <div className="space-y-1 text-zinc-400 font-medium">
                        <div className="flex justify-between"><span>TOTAL PIX:</span><span className="font-bold text-teal-400">R$ {(caixa.totalPix || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>DINHEIRO:</span><span className="font-bold text-amber-500">R$ {(caixa.totalDinheiro || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>DESPESAS:</span><span className="font-bold text-red-400">R$ {(caixa.despesas || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-zinc-800/60 pt-1.5 font-black text-white mt-1">
                          <span>SALDO LÍQUIDO:</span>
                          <span className="text-emerald-400">R$ {(caixa.saldoLiquido || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ================= ABA: REGISTRO DE PEDIDO AVULSO ================= */}
        {abaAtiva === "avulso" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-5xl mx-auto animate-fade-in">
            
            <div className="bg-zinc-900 border-2 border-zinc-800/80 rounded-[2rem] p-6 space-y-6 shadow-xl relative text-center uppercase">
              {!lojaAberta && (
                <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm rounded-[2rem] z-40 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <span className="text-3xl">🔒</span>
                  <h3 className="font-black text-red-400 text-sm">SISTEMA APENAS PARA LEITURA</h3>
                </div>
              )}
              <div className="space-y-1">
                <h2 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 tracking-wider">REGISTRAR PEDIDO BALCÃO</h2>
                <p className="text-zinc-500 text-[10px] font-bold">PREENCHIMENTO DE CADASTRO</p>
              </div>

              <form onSubmit={dispararFluxoConclusaoAvulso} className="space-y-5 text-center">
                <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-1">
                  <label className="text-[9px] font-black text-orange-400 block tracking-widest">NOME DO CLIENTE</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="EX: JOÃO SILVA" 
                    value={nomeAvulso} 
                    onChange={(e) => setNomeAvulso(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none text-center font-black" 
                  />
                </div>

                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
                  <span className="text-[10px] font-black text-zinc-400 tracking-wider block">DADOS DO COMPLEMENTO DE ROTA</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center col-span-2">
                      <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">RUA OU AVENIDA</label>
                      <input 
                        type="text" 
                        placeholder="NOME DA RUA" 
                        value={ruaAvulso}
                        onChange={(e) => setRuaAvulso(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                      />
                    </div>
                    <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center">
                      <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">NÚMERO</label>
                      <input 
                        type="text" 
                        placeholder="100" 
                        value={numeroAvulso}
                        onChange={(e) => setNumeroAvulso(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                      />
                    </div>
                  </div>
                  <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center">
                    <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">PONTO DE REFERÊNCIA</label>
                    <input 
                      type="text" 
                      placeholder="EX: PRÓXIMO À FARMÁCIA" 
                      value={referenciaAvulso}
                      onChange={(e) => setReferenciaAvulso(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-1">
                  <label className="text-[9px] font-black text-orange-400 block tracking-widest">DIRETRIZES DA SOLICITAÇÃO</label>
                  <input 
                    type="text" 
                    placeholder="EX: SEM AÇÚCAR, BEM QUENTE" 
                    value={observacaoAvulso} 
                    onChange={(e) => setObservacaoAvulso(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none text-center font-black" 
                  />
                </div>

                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center relative">
                  <label className="text-[10px] font-black text-orange-400 block tracking-widest mb-2">HORA</label>
                  <button
                    type="button"
                    onClick={() => setMostrarDropdownHora(!mostrarDropdownHora)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white font-black py-3 px-4 rounded-xl text-xs flex justify-between items-center transition-all"
                  >
                    <span className="w-full text-center">⏱️ DEFINIDO: {horarioAvulso}</span>
                    <span>{mostrarDropdownHora ? "▲" : "▼"}</span>
                  </button>
                  {mostrarDropdownHora && (
                    <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border-2 border-zinc-800 rounded-xl p-3 z-50 grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto shadow-2xl animate-fade-in">
                      {OPCOES_HORARIOS.map((hora) => (
                        <button
                          key={hora}
                          type="button"
                          onClick={() => {
                            setHorarioAvulso(hora)
                            setMostrarDropdownHora(false)
                          }}
                          className={`py-2 text-[11px] font-black rounded-lg transition-all border text-center ${horarioAvulso === hora ? "bg-orange-500 text-white border-orange-400" : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-800"}`}
                        >
                          {hora}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                  <span className="text-[10px] font-black text-zinc-400 tracking-wider block mb-2">QUANTIDADES DOS PRODUTOS</span>
                  {Object.keys(itensAvulsos).map((itemKey) => (
                    <div key={itemKey} className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl text-xs border border-zinc-800/40">
                      <span className="font-black text-zinc-200">{formatarNomeItem(itemKey)}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => alterarQtdAvulso(itemKey, -1)} className="w-7 h-7 bg-zinc-950 rounded-lg border border-zinc-800 text-zinc-300 font-black flex items-center justify-center text-sm">-</button>
                        <span className="font-black text-white w-5 text-center text-xs">{(itensAvulsos as any)[itemKey]}</span>
                        <button type="button" onClick={() => alterarQtdAvulso(itemKey, 1)} className="w-7 h-7 bg-zinc-950 rounded-lg border border-zinc-800 text-zinc-300 font-black flex items-center justify-center text-sm">+</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
                  <label className="text-[10px] font-black text-orange-400 block tracking-widest">FORMA DE PAGAMENTO</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPagamentoAvulso("Pix")}
                      className={`py-3.5 rounded-xl font-black text-xs transition-all tracking-wider ${
                        pagamentoAvulso === "Pix"
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-[1.02]"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📱 PIX
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagamentoAvulso("Dinheiro")}
                      className={`py-3.5 rounded-xl font-black text-xs transition-all tracking-wider ${
                        pagamentoAvulso === "Dinheiro"
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-[1.02]"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      💵 DINHEIRO
                    </button>
                  </div>
                </div>

                {pagamentoAvulso === "Dinheiro" && (
                  <div className="p-4 bg-zinc-950 rounded-2xl border-2 border-orange-500/20 animate-fade-in text-xs space-y-2">
                    <label className="text-[10px] font-black text-orange-400 block tracking-wider">CÉDULA OFERTADA PELO CONSUMIDOR</label>
                    <input 
                      type="text" 
                      placeholder="EX: 50.00" 
                      value={trocoParaAvulso} 
                      onChange={(e) => setTrocoParaAvulso(e.target.value)} 
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-3 text-xs text-white font-black text-center outline-none" 
                    />
                  </div>
                )}
              </form>
            </div>

            <div className="bg-zinc-900 border-2 border-zinc-800 rounded-[2rem] p-6 space-y-4 sticky top-4 text-center uppercase">
              <h2 className="text-sm font-black text-orange-400 tracking-widest border-b border-zinc-800 pb-3">🔎 CONFERÊNCIA DO PEDIDO</h2>
              
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-xs space-y-2 text-center">
                <p className="text-zinc-300 font-bold text-sm tracking-wide"><span className="text-zinc-500 block text-[9px] uppercase tracking-widest font-black mb-0.5">Cliente:</span> {nomeAvulso || "NÃO INFORMADO"}</p>
                <p className="text-zinc-300 font-bold text-sm tracking-wide"><span className="text-zinc-500 block text-[9px] uppercase tracking-widest font-black mb-0.5">Horário:</span> ⏱️ {horarioAvulso}</p>
                <p className="text-zinc-300 font-bold text-sm tracking-wide"><span className="text-zinc-500 block text-[9px] uppercase tracking-widest font-black mb-0.5">Forma de Pagamento:</span> {pagamentoAvulso.toUpperCase()}</p>
                
                {pagamentoAvulso === "Dinheiro" && (
                  <p className="text-orange-400 font-black text-sm tracking-wide">
                    <span className="text-zinc-500 block text-[9px] uppercase tracking-widest font-black mb-0.5">Troco:</span> 
                    R$ {trocoAvulsoCalculado > 0 ? trocoAvulsoCalculado.toFixed(2) : "0.00"}
                  </p>
                )}
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-xs space-y-1.5 text-center">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Composição do Pedido</span>
                {Object.entries(itensAvulsos).filter(([_, qtd]) => qtd > 0).length === 0 ? (
                  <p className="text-zinc-600 font-bold italic py-2">NENHUM ITEM ADICIONADO ATÉ O MOMENTO</p>
                ) : (
                  Object.entries(itensAvulsos).map(([key, qtd]) => qtd > 0 && (
                    <div key={key} className="text-zinc-200 font-black text-sm py-0.5">
                      • {formatarNomeItem(key)} <span className="text-orange-400">({qtd}X)</span>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col justify-center items-center space-y-1">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Líquido</span>
                <p className="text-3xl font-black text-emerald-400 tracking-tight">R$ {valorTotalAvulso}</p>
              </div>

              <button
                type="button"
                onClick={executarCopiaResumo}
                className="w-full py-3.5 mt-3 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-xl font-black text-xs uppercase transition-all tracking-wider flex items-center justify-center gap-2 shadow-sm"
              >
                📋 Copiar Resumo
              </button>

              <button
                type="button"
                onClick={() => {
                  const texto = encodeURIComponent(gerarResumoPedidoWhatsApp())
                  window.open(`https://wa.me/?text=${texto}`, "_blank")
                }}
                className="w-full py-3.5 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase transition-all tracking-wider flex items-center justify-center gap-2"
              >
                📱 Abrir WhatsApp
              </button>

              <button 
                onClick={dispararFluxoConclusaoAvulso} 
                disabled={valorTotalAvulsoNumerico === 0 || !nomeAvulso.trim() || !lojaAberta} 
                className="w-full px-6 py-4 mt-2 rounded-xl font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:opacity-95 text-xs tracking-widest transition-all shadow-lg disabled:opacity-40 uppercase flex items-center justify-center gap-1"
              >
                ➡️ Concluir Pedido
              </button>
            </div>

          </div>
        )}
      </div>
    </main>
  )
}