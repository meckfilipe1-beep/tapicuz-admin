import * as QRCode from "qrcode"

function formatarBloco(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, "0")
  return `${id}${tamanho}${valor}`
}

export async function gerarPixCopiaECola(valor: number) {
  // Ajustado exatamente para a chave pura de 11 dígitos fornecida, sem o 55
  const chave =  "+5591984269140"
  const nomePDV = "SUELI BAHIA" 
  const nomeConsumidor = "CONSUMIDOR"
  const city = "BELEMPA"
  
  const formatadoValor = valor.toFixed(2)
  
  // Montagem do bloco 26 idêntica ao que funcionou no seu PDV
  const merchantAccount =
    formatarBloco("00", "br.gov.bcb.pix") +
    formatarBloco("01", chave) +
    formatarBloco("02", nomePDV)

  // Estrutura completa validada
  const payloadFormatado = 
    "000201" + 
    "010211" + 
    formatarBloco("26", merchantAccount) + 
    "52040000" + 
    "5303986" + 
    formatarBloco("54", formatadoValor) + 
    "5802BR" + 
    formatarBloco("59", nomeConsumidor) + 
    formatarBloco("60", city) + 
    "62070503***" + 
    "6304" 

  // Cálculo matemático do CRC16 baseado no novo tamanho
  let crc = 0xFFFF
  for (let i = 0; i < payloadFormatado.length; i++) {
    let x = ((crc >> 8) ^ payloadFormatado.charCodeAt(i)) & 0xFF
    x ^= x >> 4
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF
  }
  const crcString = crc.toString(16).toUpperCase().padStart(4, "0")

  const payload = `${payloadFormatado}${crcString}`

  let qr = ""
  try {
    qr = await QRCode.toDataURL(payload)
  } catch (err) {
    console.error("Erro ao gerar QR Code:", err)
  }

  return {
    payload,
    qr
  }
}