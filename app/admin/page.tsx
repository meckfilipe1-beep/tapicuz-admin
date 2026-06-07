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
    tapiocaMolhada: "TAPIOCA MOLHADA",
    tapiocaManteiga: "🧈 TAPIOCA COM MANTEIGA",
    tapiocaQueijo: "🧀 TAPIOCA COM QUEIJO",
    tapiocaOvo: "🥚 TAPIOCA COM OVO",
    tapiocaQueijoOvo: "🧀🥚 TAPIOCA QUEIJO E OVO",
    cuscuzMilho: "🌽 CUSCUZ DE MILHO",
    cuscuzArroz: "🍚 CUSCUZ DE ARROZ",
    cafe: "☕ CAFÉ"
  }
  return nomes[nomeChave] || nomeChave.toUpperCase()
}

function extraInforNumero(text: string): string {
  const clean = text.replace(/\D/g, "")
  if (clean === "5591984269140" || clean === "91984269140") {
    return "+5591984269140"
  }
  if (clean.length === 8 || clean.length === 9) {
    return `+55919${clean.slice(-8)}`
  }
  if (clean.length === 11) {
    return `+55${clean.slice(0, 2)}9${clean.slice(-8)}`
  }
  if (clean.length === 13 && clean.startsWith("55")) {
    return `+${clean}`
  }
  return clean.length >= 8 ? `+${clean}` : ""
}

async function gerarPixCopiaECola(valor: number) {
  try {
    const chavePix = "+5591984269140" 
    const nomeRecebedor = "SUELI BAHIA"
    const cidadeRecebedor = "BELEMPA"
    
    const txtValor = valor.toFixed(2)
    const merchantCategoryCode = "0000"
    const transactionCurrency = "986" 
    
    const pChave = `26${(String(chavePix.length + 22)).padStart(2, '0')}0014br.gov.bcb.pix01${String(chavePix.length).padStart(2, '0')}${chavePix}`
    const pCategoria = `52${String(merchantCategoryCode.length).padStart(2, '0')}${merchantCategoryCode}`
    const pMoeda = `53${String(transactionCurrency.length).padStart(2, '0')}${transactionCurrency}`
    const pValor = `54${String(txtValor.length).padStart(2, '0')}${txtValor}`
    const pPais = "5802BR"
    const pNome = `59${String(nomeRecebedor.length).padStart(2, '0')}${nomeRecebedor}`
    const pCidade = `60${String(cidadeRecebedor.length).padStart(2, '0')}${cidadeRecebedor}`
    const pAdicionais = "62070503***"
    
    const payloadBase = `000201${pChave}${pCategoria}${pMoeda}${pValor}${pPais}${pNome}${pCidade}${pAdicionais}6304`
    
    let crc = 0xFFFF
    for (let i = 0; i < payloadBase.length; i++) {
      crc ^= payloadBase.charCodeAt(i) << 8
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ 0x1021
        } else {
          crc <<= 1
        }
      }
    }
    const crcString = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
    
    return {
      payload: `${payloadBase}${crcString}`
    }
  } catch (error) {
    console.error("Erro ao gerar string Pix:", error)
    return { payload: "00020126450014..." }
  }
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
  const [abaAtiva, setAbaAtiva] = useState<"pedidos" | "avulso" | "historico" | "caixa">("pedidos")
  const [lojaAberta, setLojaAberta] = useState<boolean>(true)

  const [pedidoConcluindoId, setPedidoConcluindoId] = useState<string | null>(null)
  const [notificacaoCaixa, setNotificacaoCaixa] = useState<string | null>(null)
  const [mostrarResumoFinalAvulso, setMostrarResumoFinalAvulso] = useState(false)
  const [pedidoDetalhado, setPedidoDetalhado] = useState<Pedido | null>(null)
  const [exibirFaturamentoGeral, setExibirFaturamentoGeral] = useState(false)
  const [mostrarDemandas, setMostrarDemandas] = useState(false)
  const [mostrarDropdownHora, setMostrarDropdownHora] = useState(false)
  
  const [modalConfirmarTurno, setModalConfirmarTurno] = useState(false)

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

  const [codigoPix, setCodigoPix] = useState("")
  const [pixCopiado, setPixCopiado] = useState(false)
  const [textoCompletoPronto, setTextoCompletoPronto] = useState("")
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    async function gerar() {
      if (!mostrarResumoFinalAvulso) return
      try {
        const dadosPix = await gerarPixCopiaECola(valorTotalAvulsoNumerico)
        setCodigoPix(dadosPix.payload)
        
        let texto = `🧾 *RESUMO DO PEDIDO - TAPICUZ* ☕\n\n`
        texto += `👤 *CLIENTE:* ${nomeAvulso}\n`
        const enderecoFormatado = construirEnderecoCompleto()
        texto += `📍 *ENTREGA:* ${extraInforNumero(enderecoFormatado) ? extraInforNumero(enderecoFormatado) : enderecoFormatado}\n`
        if (observacaoAvulso.trim()) {
          texto += `📝 *OBS:* ${observacaoAvulso}\n`
        }
        texto += `⏱️ *HORÁRIO ESTIMADO:* ${horarioAvulso}\n\n`
        texto += `📦 *ITENS SOLICITADOS:*\n`
        Object.entries(itensAvulsos).forEach(([key, qtd]) => {
          if (qtd > 0) {
            texto += `• ${qtd}x ${formatarNomeItem(key)}\n`
          }
        })
        texto += `\n💰 *VALOR TOTAL:* R$ ${valorTotalAvulso}\n`
        texto += `💳 *FORMA DE PAGAMENTO:* ${pagamentoAvulso.toUpperCase()}\n\n`
        
        if (pagamentoAvulso === "Pix") {
          texto += `⚙️ *PIX COPIA E COLA* (Clique e segure no código abaixo para copiar):\n\n`
          texto += `${dadosPix.payload}\n\n`
          texto += `👤 *TITULAR:* SUELI BAHIA\n`
          texto += `🔑 *CHAVE:* +5591984269140\n`
          texto += `📍 *CIDADE:* BELEMPA`
        } else if (pagamentoAvulso === "Dinheiro" && trocoParaAvulsoNumerico > valorTotalAvulsoNumerico) {
          const tCalculado = trocoParaAvulsoNumerico - valorTotalAvulsoNumerico
          texto += `💵 *PAGO EM DINHEIRO:* R$ ${trocoParaAvulsoNumerico.toFixed(2)}\n`
          texto += `🔄 *SEU TROCO:* R$ ${tCalculado.toFixed(2)}\n`
        }
        
        setTextoCompletoPronto(texto)
      } catch (error) {
        console.error(error)
      }
    }
    gerar()
  }, [mostrarResumoFinalAvulso, valorTotalAvulsoNumerico, pagamentoAvulso, trocoParaAvulso])

  async function copiarPix() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(codigoPix)
        setPixCopiado(true)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = codigoPix
        textArea.style.position = "fixed"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
        setPixCopiado(true)
      }
      setTimeout(() => setPixCopiado(false), 3000)
    } catch (error) {
      console.error(error)
    }
  }

  // FUNÇÃO REFORMULADA: SE O SISTEMA IGNORAR O PROMPT AUTOMÁTICO, ELE SELECIONA O CAMPO TEXTAREA VISÍVEL DA TELA
  async function copiarDescricaoCompleta() {
    try {
      if (textareaRef.current) {
        textareaRef.current.select()
        textareaRef.current.setSelectionRange(0, 99999) // Para Mobile
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textoCompletoPronto)
        setNotificacaoCaixa("📋 RESUMO COPIADO COMPLETO!")
      } else {
        document.execCommand("copy")
        setNotificacaoCaixa("📋 SELECIONADO! TOQUE EM COPIAR")
      }
      setTimeout(() => setNotificacaoCaixa(null), 2500)
    } catch (error) {
      console.error("Erro na cópia nativa, use a caixa de texto:", error)
      setNotificacaoCaixa("⚠️ SELECIONE E COPIE A CAIXA ABAIXO")
      setTimeout(() => setNotificacaoCaixa(null), 3000)
    }
  }

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

  async function ejecutarFechamentoTurno() {
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

  function preVisualizarPedidoAvulso(e: any) {
    e.preventDefault()
    if (!nomeAvulso.trim() || valorTotalAvulsoNumerico === 0 || !lojaAberta) return
    setMostrarResumoFinalAvulso(true)
  }

  function construirEnderecoCompleto() {
    if (!ruaAvulso.trim() && !numeroAvulso.trim()) return "RETIRADA NO BALCÃO"
    const partes = []
    if (ruaAvulso.trim()) partes.push(ruaAvulso.trim())
    if (numeroAvulso.trim()) partes.push(`Nº ${numeroAvulso.trim()}`)
    if (referenciaAvulso.trim()) partes.push(`(REF: ${referenciaAvulso.trim()})`)
    return partes.join(", ").toUpperCase()
  }

  async function confirmarELancarPedidoAvulsoFinal() {
    if (criandoAvulso || !lojaAberta) return
    setCriandoAvulso(true)

    const enderecoFinalMontado = construirEnderecoCompleto()

    const novoPedidoAvulso: any = {
      nome: nomeAvulso.trim().toUpperCase(),
      endereco: enderecoFinalMontado,
      pagamento: pagamentoAvulso,
      troco: trocoAvulsoCalculado,
      valorTotal: valorTotalAvulsoNumerico,
      horario: horarioAvulso,
      pago: pagamentoAvulso === "Pix",
      concluido: false,
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
      
      {/* ================= NOTIFICADOR FLUTUANTE CUSTOMIZADO ================= */}
      {notificacaoCaixa && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
          <span className="text-xs font-black text-emerald-400 bg-zinc-900 border-2 border-emerald-500/30 shadow-2xl px-6 py-3 rounded-2xl tracking-wide uppercase block">
            {notificacaoCaixa}
          </span>
        </div>
      )}

      {/* ================= MODAL DE RESUMO BLINDADO CONTRA BLOQUEIO DE CÓPIA ================= */}
      {mostrarResumoFinalAvulso && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl text-[11px] uppercase text-center max-h-[95vh] flex flex-col justify-between">
            
            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              <div className="space-y-0.5">
                <span className="text-xl">🧾</span>
                <h2 className="text-sm font-black text-orange-400 tracking-wider">RESUMO DO PEDIDO</h2>
              </div>

              {/* CAIXA DE TEXTO BRUTA REVOLUCIONÁRIA (SE O BOTÃO FALHAR, O TEXTO ESTÁ AQUI PARA COPIAR MANUAL) */}
              <div className="space-y-1 text-left bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                <span className="text-[8px] font-black text-zinc-500 tracking-widest block mb-1">TEXTO COMPLETO PARA WHATSAPP:</span>
                <textarea
                  ref={textareaRef}
                  readOnly
                  value={textoCompletoPronto}
                  onClick={(e) => {
                    (e.target as HTMLTextAreaElement).select()
                  }}
                  className="w-full h-32 bg-black text-zinc-200 p-2 rounded-lg font-mono text-[10px] normal-case border border-zinc-800 focus:border-amber-500 outline-none resize-none select-all"
                />
              </div>
              
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={copiarDescricaoCompleta}
                  className="w-full py-3.5 rounded-xl bg-amber-500 text-zinc-950 hover:bg-amber-400 font-black uppercase tracking-wider text-[10px] shadow-md transition-all active:scale-[0.99]"
                >
                  ⚡ SELECIONAR & COPIAR RESUMO COMPLETO
                </button>

                {pagamentoAvulso === "Pix" && (
                  <div className="bg-zinc-950 p-3 rounded-2xl border border-emerald-500/20 text-center animate-fade-in mt-1">
                    <button
                      type="button"
                      onClick={copiarPix}
                      className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black uppercase tracking-wider text-[10px] shadow-sm transition-all"
                    >
                      {pixCopiado ? "✅ APENAS CÓDIGO PIX COPIADO" : "📋 COPIAR APENAS CÓDIGO PIX"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800">
              <button onClick={() => setMostrarResumoFinalAvulso(false)} className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-black text-[10px] tracking-widest transition-all">← AJUSTAR</button>
              <button onClick={confirmarELancarPedidoAvulsoFinal} disabled={criandoAvulso || !lojaAberta} className="py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-black text-[10px] tracking-widest transition-all shadow-lg">FINALIZAR ✓</button>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL COMPLETO DE FECHAMENTO ================= */}
      {modalConfirmarTurno && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 text-center space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-lg mx-auto font-bold shadow-md">🗂️</div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-black text-zinc-200 uppercase tracking-wide">RESUMO COMPLETO DO TURNO</h3>
              <p className="text-zinc-500 font-medium uppercase">CONFIRA TODOS OS DETALHES DO DIA ANTES DE FECHAR E ARQUIVAR.</p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-left space-y-2 uppercase">
              <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block border-b border-zinc-900 pb-1">BALANÇO FINANCEIRO</span>
              <div className="flex justify-between text-zinc-400"><span>ENTRADAS VIA PIX:</span><span className="font-bold text-teal-400">R$ {totalPix.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>ENTRADAS EM DINHEIRO:</span><span className="font-bold text-amber-500">R$ {totalDinheiro.toFixed(2)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>DESPESAS/RETIRADAS:</span><span className="font-bold text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</span></div>
              <div className="flex justify-between text-white border-t border-zinc-900 pt-2 font-black mt-1">
                <span className="text-zinc-300">SALDO LÍQUIDO DO DIA:</span>
                <span className="text-emerald-400 text-sm">R$ {saldoLiquidoAtual.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 font-medium px-4 uppercase">AO CONFIRMAR, A FILA ATUAL SERÁ LIMPA PARA O PRÓXIMO TURNO.</p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setModalConfirmarTurno(false)} className="py-3 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-xl text-zinc-300 transition-all uppercase">VOLTAR</button>
              <button type="button" onClick={executarFechamentoTurno} className="py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:opacity-95 font-black rounded-xl text-white uppercase tracking-wider transition-all shadow-md">CONFIRMAR & FECHAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL RELATÓRIO GENERAL ================= */}
      {exibirFaturamentoGeral && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-emerald-500/30 w-full max-w-sm rounded-3xl p-6 text-center space-y-5 shadow-2xl uppercase">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center text-xl mx-auto font-bold shadow-inner">🧮</div>
            <div className="space-y-1">
              <h3 className="text-xs font-black text-zinc-400 tracking-widest">RELATÓRIO CONSOLIDADO</h3>
              <p className="text-sm font-bold text-zinc-200">FATURAMENTO ACUMULADO GERAL</p>
            </div>
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-inner">
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-500 block mb-1">VALOR TOTAL LÍQUIDO</span>
              <p className="text-3xl font-black text-emerald-400 tracking-tight">R$ {faturamentoAcumuladoGeral.toFixed(2)}</p>
            </div>
            <button type="button" onClick={() => setExibirFaturamentoGeral(false)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-xs rounded-xl tracking-wider transition-all shadow-md">FECHAR RELATÓRIO</button>
          </div>
        </div>
      )}

      {/* ================= MODAL DETALHES DO PEDIDO ================= */}
      {pedidoDetalhado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl text-xs uppercase">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-black tracking-wider text-orange-400">DETALHES DO PEDIDO</h2>
              <button onClick={() => setPedidoDetalhado(null)} className="w-7 h-7 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 text-sm font-bold">✕</button>
            </div>
            <div className="space-y-2.5 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">CLIENTE:</span><span className="font-black text-white">{pedidoDetalhado.nome}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 font-bold">HORÁRIO:</span><span className="font-black text-amber-400">⏱ {pedidoDetalhado.horario}</span></div>
              
              <div className="flex justify-between items-center gap-2">
                <span className="text-zinc-500 font-bold">LOCAL:</span>
                {extraInforNumero(pedidoDetalhado.endereco) ? (
                  <a href={`tel:${extraInforNumero(pedidoDetalhado.endereco)}`} className="font-bold text-orange-400 underline hover:text-orange-300 transition-colors bg-orange-400/10 px-2 py-1 rounded-lg">
                    {extraInforNumero(pedidoDetalhado.endereco)} 📞
                  </a>
                ) : (
                  <span className="font-bold text-zinc-300 truncate max-w-[200px]">{pedidoDetalhado.endereco}</span>
                )}
              </div>
              
              {pedidoDetalhado.observacao && (
                <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                  <p className="text-[10px] font-black text-orange-400 mb-1">OBSERVAÇÃO</p>
                  <p className="text-zinc-200 text-xs font-black">{pedidoDetalhado.observacao}</p>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-800/50 pt-2"><span className="text-zinc-500 font-bold">PAGAMENTO:</span><span className="font-black text-teal-400">{pedidoDetalhado.pagamento}</span></div>
            </div>
            <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/60 text-center">
              {Object.entries(pedidoDetalhado.itens || {}).map(([key, qtd]) => qtd > 0 && (
                <div key={key} className="flex justify-between text-zinc-300">
                  <span>{formatarNomeItem(key)}</span>
                  <span className="font-black text-orange-400">{qtd}X</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-emerald-500/10">
              <span className="text-[10px] font-bold text-zinc-400">FATURAMENTO RECEBIDO</span>
              <p className="text-xl font-black text-emerald-400">R$ {pedidoDetalhado.valorTotal.toFixed(2)}</p>
            </div>
            <div className="pt-2 flex gap-2">
              <button onClick={() => setPedidoDetalhado(null)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-center">FECHAR</button>
              <button onClick={() => deletarDoHistorico(pedidoDetalhado.id)} className="px-4 py-3 bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl font-bold">🗑️</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* ================= TOPBAR COM SWITCH SLIDER ================= */}
        <div className="flex flex-col gap-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl uppercase">
          <div className="flex flex-row justify-between items-center w-full">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 tracking-tight">TAPICUZ ADMIN ☀️</h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 font-bold">PAINEL DE CONTROLE</p>
            </div>

            <div className="flex items-center gap-3 bg-zinc-950/60 border border-zinc-800/80 py-2 px-4 rounded-2xl shadow-inner">
              <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${lojaAberta ? "text-emerald-400" : "text-zinc-500"}`}>
                {lojaAberta ? "PEDIDOS ATIVOS" : "PEDIDOS PAUSADOS"}
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
              <span>PEDIDOS</span>
            </button>
            <button onClick={() => setAbaAtiva("avulso")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "avulso" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">➕</span>
              <span>PEDIDO AVULSO</span>
            </button>
            <button onClick={() => setAbaAtiva("historico")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "historico" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">📜</span>
              <span>VENDAS ({pedidosConcluidos.length})</span>
            </button>
            <button onClick={() => setAbaAtiva("caixa")} className={`p-4 rounded-2xl text-xs font-black uppercase border flex flex-col items-center justify-center gap-2 transition-all ${abaAtiva === "caixa" ? "bg-orange-600 text-white border-orange-400 scale-[1.02]" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
              <span className="text-lg">💰</span>
              <span>CAIXA GERAL</span>
            </button>
          </div>
        </div>

        {/* ================= ABA: TOTAL DE PEDIDOS ================= */}
        {abaAtiva === "pedidos" && (
          <div className="space-y-6 animate-fade-in uppercase">
            
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-center shadow-md">
                <span className="text-[10px] font-bold text-zinc-500 block mb-0.5">NA FILA AGORA</span>
                <p className="text-2xl font-black text-orange-400">{pedidosAtivos.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-center shadow-md">
                <span className="text-[10px] font-bold text-zinc-500 block mb-0.5">TOTAL DE PEDIDOS</span>
                <p className="text-2xl font-black text-amber-500">{pedidos.length}</p>
              </div>
            </div>

            {/* DEMANDAS DA PRODUÇÃO COLETIVA */}
            {pedidosAtivos.length > 0 && (
              <div className="max-w-xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl text-center">
                <button 
                  type="button"
                  onClick={() => setMostrarDemandas(!mostrarDemandas)}
                  className="w-full text-sm font-black text-orange-400 tracking-wider flex items-center justify-center gap-2 outline-none py-1"
                >
                  👩‍🍳 DEMANDAS DA PRODUÇÃO COLETIVA {mostrarDemandas ? "▲" : "▼"}
                </button>
                
                {mostrarDemandas && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-4 border-t border-zinc-800 pt-4 animate-fade-in">
                    {Object.entries(demandasProducao)
                      .filter(([_, qtd]) => qtd > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([item, qtd]) => (
                        <div key={item} className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800/40 font-black text-center">
                          <span className="text-zinc-300 w-full text-center">{formatarNomeItem(item)}</span>
                          <span className="text-lg font-black text-orange-400 bg-zinc-900/80 border border-zinc-800 px-3 py-0.5 rounded-lg shadow-inner">{qtd}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {carregando ? (
              <div className="text-center py-12 text-zinc-500 text-xs animate-pulse">SINCRONIZANDO BANCO...</div>
            ) : pedidosAtivos.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/40 border border-zinc-800 border-dashed rounded-3xl text-zinc-500 text-xs font-bold">NENHUM PEDIDO ATIVO NA FILA DE PRODUÇÃO.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {pedidosAtivos.map((pedido) => {
                  const estaConcluindo = pedidoConcluindoId === pedido.id
                  const foneContato = extraInforNumero(pedido.endereco)
                  return (
                    <div key={pedido.id} className={`border rounded-3xl p-5 space-y-4 shadow-xl transition-all flex flex-col justify-between duration-300 uppercase ${estaConcluindo ? "bg-emerald-500 border-emerald-400 text-zinc-950 scale-[0.98] opacity-90 text-center" : "bg-zinc-900 border-zinc-800 text-zinc-100"}`}>
                      {estaConcluindo ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                          <span className="text-3xl animate-bounce">🎉</span>
                          <h3 className="font-black text-sm text-white">PEDIDO CONCLUÍDO!</h3>
                        </div>
                      ) : (
                        <>
                          <div className="bg-black/50 border border-zinc-800 rounded-2xl py-2 px-4 flex items-center justify-center shadow-inner">
                            <span className="text-lg font-black text-orange-400 tracking-wider">⏱️ {pedido.horario}</span>
                          </div>
                          
                          <div className="border-b border-zinc-800/60 pb-2.5 text-center space-y-2">
                            <div>
                              <span className="text-[9px] text-zinc-500 font-bold block mb-0.5">CLIENTE</span>
                              <h3 className="font-black text-white text-base tracking-tight">{pedido.nome}</h3>
                            </div>

                            <div className="flex flex-col items-center justify-center gap-1">
                              <span className="text-[9px] text-zinc-500 font-bold block">CONTATO / LOCALIZAÇÃO</span>
                              {foneContato ? (
                                <a 
                                  href={`tel:${foneContato}`} 
                                  className="text-xs text-yellow-400 font-black tracking-wide bg-yellow-400/5 py-1.5 px-3 rounded-xl border border-yellow-400/20 inline-block hover:bg-yellow-400/10 transition-all text-center max-w-full truncate"
                                >
                                  📍 {foneContato} 📞
                                </a>
                              ) : (
                                <span className="text-xs text-yellow-400 font-black tracking-wide bg-yellow-400/5 py-1.5 px-3 rounded-xl border border-yellow-400/10 inline-block text-center max-w-full truncate">
                                  📍 {pedido.endereco}
                                </span>
                              )}
                            </div>

                            {pedido.observacao && (
                              <div className="mt-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-center">
                                <p className="text-[10px] text-orange-400 font-black mb-1">OBSERVAÇÃO DO CLIENTE</p>
                                <p className="text-xs text-zinc-200 font-black">{pedido.observacao}</p>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5 bg-black/20 p-3 rounded-xl border border-zinc-800/60 text-xs text-center">
                            <span className="text-[9px] text-zinc-500 font-bold block mb-1">ITENS DO PEDIDO</span>
                            {Object.entries(pedido.itens || {}).map(([key, qtd]) => qtd > 0 && (
                              <div key={key} className="flex justify-center items-center text-zinc-100 font-black">
                                <span><strong className="text-amber-300 mr-1">{qtd}X</strong> {formatarNomeItem(key)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="black/40 p-3 rounded-xl border border-zinc-800 flex justify-between items-center text-xs">
                            <div>
                              <span className="text-zinc-400 font-bold text-[9px] block">FORMA</span>
                              <span className="font-black text-zinc-200">{pedido.pagamento}</span>
                              {pedido.pagamento === "Dinheiro" && pedido.troco > 0 && (
                                <span className="font-black text-red-400 block mt-0.5 text-xs">TROCO: R$ {pedido.troco.toFixed(2)}</span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-zinc-400 font-bold text-[9px] block">TOTAL</span>
                              <span className="text-base font-black text-emerald-400">R$ {pedido.valorTotal.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="pt-1">
                            <button type="button" onClick={() => iniciarConclusaoPedido(pedido.id)} className="w-full py-3.5 bg-white hover:bg-zinc-100 text-zinc-950 rounded-xl font-black text-xs tracking-wider transition-all shadow-md">CONCLUIR PEDIDO</button>
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
          <div className="space-y-6 animate-fade-in uppercase">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl text-xs">
              <h2 className="text-sm font-black text-orange-400 tracking-wider border-b border-zinc-800 pb-2 text-center">VENDAS FATURADAS DO TURNO ATUAL</h2>
              {pedidosConcluidos.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 font-bold">NENHUM PEDIDO FINALIZADO NO TURNO AINDA.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 font-bold">
                        <th className="pb-2">HORÁRIO</th>
                        <th className="pb-2">CLIENTE</th>
                        <th className="pb-2">ENDEREÇO COMPLETO</th>
                        <th className="pb-2">PAGAMENTO</th>
                        <th className="pb-2">TOTAL</th>
                        <th className="pb-2 text-center">AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosConcluidos.map((pedido) => (
                        <tr key={pedido.id} className="border-b border-zinc-800/30 hover:bg-zinc-950/20">
                          <td className="py-2.5 font-black text-amber-400">{pedido.horario}</td>
                          <td className="py-2.5 font-bold text-zinc-200">{pedido.nome}</td>
                          <td className="py-2.5 text-zinc-400 max-w-[220px] truncate">{pedido.endereco}</td>
                          <td className="py-2.5 font-bold text-zinc-400">{pedido.pagamento}</td>
                          <td className="py-2.5 font-black text-emerald-400">R$ {pedido.valorTotal.toFixed(2)}</td>
                          <td className="py-2.5 text-center">
                            <button onClick={() => setPedidoDetalhado(pedido)} className="bg-zinc-800 text-zinc-300 font-bold px-2 py-1 rounded-md">👁️ DETALHES</button>
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
          <div className="space-y-6 animate-fade-in uppercase">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">TURNO: PIX</span>
                <p className="text-lg font-black text-teal-400">R$ {totalPix.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">TURNO: DINHEIRO</span>
                <p className="text-lg font-black text-amber-500">R$ {totalDinheiro.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-red-900/30 p-5 rounded-3xl space-y-1 shadow-xl">
                <span className="text-[10px] font-bold text-red-400 tracking-widest block">TURNO: DESPESAS</span>
                <p className="text-lg font-black text-red-400">R$ {totalDespesasAcumuladas.toFixed(2)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-1 shadow-xl bg-gradient-to-b from-zinc-900 to-zinc-950">
                <span className="text-[10px] font-bold text-zinc-400 tracking-widest block">TURNO: LÍQUIDO ATUAL</span>
                <p className="text-lg font-black text-white">R$ {saldoLiquidoAtual.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
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
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded-xl p-3 text-xs text-white outline-none transition-all text-center font-bold" 
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-black px-6 rounded-xl text-xs tracking-wider transition-all">LANÇAR</button>
                </form>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center items-center text-center space-y-3">
                <button type="button" onClick={() => setModalConfirmarTurno(true)} className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs tracking-widest rounded-xl transition-all shadow-md">
                  💾 SALVAR & FECHAR TURNO
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= ABA: PEDIDO AVULSO ================= */}
        {abaAtiva === "avulso" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-5xl mx-auto animate-fade-in uppercase">
            
            {/* FORMULÁRIO */}
            <div className="bg-zinc-900 border-2 border-zinc-800/80 rounded-[2rem] p-6 space-y-6 shadow-xl relative text-center">
              {!lojaAberta && (
                <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm rounded-[2rem] z-40 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <span className="text-3xl">🔒</span>
                  <h3 className="font-black text-red-400 text-sm">LANÇAMENTOS BLOQUEADOS</h3>
                </div>
              )}
              
              <div className="space-y-1">
                <h2 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 tracking-wider">REGISTRAR PEDIDO BALCÃO</h2>
                <p className="text-zinc-500 text-[10px] font-bold">PREENCHIMENTO RÁPIDO E INDEPENDENTE</p>
              </div>

              <form onSubmit={preVisualizarPedidoAvulso} className="space-y-5 text-center">
                
                {/* NOME CLIENTE */}
                <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-1 text-center">
                  <label className="text-[9px] font-black text-orange-400 block tracking-widest">NOME DO CLIENTE</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="EX: JOÃO SILVA" 
                    value={nomeAvulso} 
                    onChange={(e) => setNomeAvulso(e.target.value.toUpperCase())} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none text-center font-black" 
                  />
                </div>

                {/* ENDEREÇO / TELEFONE */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
                  <span className="text-[10px] font-black text-zinc-400 tracking-wider block">INFORMAÇÕES DE LOCALIZAÇÃO</span>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center col-span-2">
                      <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">TELEFONE OU ENDEREÇO</label>
                      <input 
                        type="text" 
                        placeholder="NÚMERO OU RUA DO CLIENTE" 
                        value={ruaAvulso}
                        onChange={(e) => setRuaAvulso(e.target.value.toUpperCase())}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                      />
                    </div>
                    <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center">
                      <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">NÚMERO</label>
                      <input 
                        type="text" 
                        placeholder="123" 
                        value={numeroAvulso}
                        onChange={(e) => setNumeroAvulso(e.target.value.toUpperCase())}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-center">
                    <label className="text-[8px] font-black text-orange-400 block tracking-wider mb-1">PONTO DE REFERÊNCIA</label>
                    <input 
                      type="text" 
                      placeholder="EX: PRÓXIMO À PRAÇA" 
                      value={referenciaAvulso}
                      onChange={(e) => setReferenciaAvulso(e.target.value.toUpperCase())}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white font-black text-center outline-none"
                    />
                  </div>
                </div>

                {/* OBSERVAÇÃO */}
                <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-1 text-center">
                  <label className="text-[9px] font-black text-orange-400 block tracking-widest">OBSERVAÇÕES INTERNAS</label>
                  <input 
                    type="text" 
                    placeholder="EX: SEM AÇÚCAR, BEM QUENTE" 
                    value={observacaoAvulso} 
                    onChange={(e) => setObservacaoAvulso(e.target.value.toUpperCase())} 
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-xl p-2.5 text-xs text-white outline-none text-center font-black" 
                  />
                </div>

                {/* HORÁRIO DROPDOWN */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center relative">
                  <label className="text-[10px] font-black text-orange-400 block tracking-widest mb-2">HORÁRIO DE PREFERÊNCIA</label>
                  <button
                    type="button"
                    onClick={() => setMostrarDropdownHora(!mostrarDropdownHora)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white font-black py-3 px-4 rounded-xl text-xs flex justify-between items-center transition-all"
                  >
                    <span className="w-full text-center">⏱️ SELECIONADO: {horarioAvulso}</span>
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

                {/* CARDÁPIO */}
                <div className="space-y-2 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                  <span className="text-[10px] font-black text-zinc-400 tracking-wider block mb-2">ITENS DO CARDÁPIO</span>
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

                {/* PAGAMENTO */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 text-center">
                  <label className="text-[10px] font-black text-orange-400 block tracking-widest">FORMA DE PAGAMENTO</label>
                  <select 
                    value={pagamentoAvulso} 
                    onChange={(e) => setPagamentoAvulso(e.target.value as any)} 
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs font-black text-white text-center outline-none"
                  >
                    <option value="Pix">PIX</option>
                    <option value="Dinheiro">DINHEIRO</option>
                  </select>
                </div>

                {/* ENTRADA DINHEIRO */}
                {pagamentoAvulso === "Dinheiro" && (
                  <div className="p-4 bg-zinc-950 rounded-2xl border-2 border-amber-500/20 animate-fade-in text-xs space-y-2 text-center">
                    <label className="text-[10px] font-black text-amber-400 block tracking-wider">VALOR QUE O CLIENTE VAI PAGAR</label>
                    <input 
                      type="text" 
                      placeholder="EX: 50.00" 
                      value={trocoParaAvulso} 
                      onChange={(e) => setTrocoParaAvulso(e.target.value)} 
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl p-3 text-xs text-white font-black text-center outline-none" 
                    />
                  </div>
                )}
              </form>
            </div>

            {/* SEÇÃO LADO DIREITO */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 space-y-5 sticky top-4 text-center">
              <h2 className="text-xs font-black text-orange-400 tracking-widest border-b border-zinc-800 pb-2">🔍 CONFERÊNCIA EM TEMPO REAL</h2>
              
              <div className="space-y-2 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shadow-inner">
                <span className="text-[9px] text-zinc-500 font-black block">VALOR ATUAL CALCULADO</span>
                <p className="text-3xl font-black text-emerald-400 tracking-tight">R$ {valorTotalAvulso}</p>
              </div>

              {pagamentoAvulso === "Dinheiro" && trocoAvulsoCalculado > 0 && (
                <div className="bg-zinc-950 p-5 rounded-2xl border-2 border-red-500/40 animate-fade-in text-center space-y-1 shadow-inner">
                  <span className="text-[10px] font-black text-zinc-400 tracking-wider block">VALOR DO TROCO PARA DEVOLUÇÃO</span>
                  <p className="text-3xl font-black text-red-400 tracking-tight">R$ {trocoAvulsoCalculado.toFixed(2)}</p>
                </div>
              )}

              <button 
                onClick={preVisualizarPedidoAvulso} 
                disabled={valorTotalAvulsoNumerico === 0 || !nomeAvulso.trim() || !lojaAberta} 
                className="w-full px-6 py-4 rounded-2xl font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:opacity-95 text-xs tracking-widest transition-all shadow-lg disabled:opacity-40"
              >
                REVISAR & VER RESUMO FINAL →
              </button>
            </div>

          </div>
        )}
      </div>
    </main>
  )
}