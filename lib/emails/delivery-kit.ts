import { cleanDocumentName } from '@/lib/proposalUtils'

const WHATSAPP_NUMBER = '14076396154'
const GOOGLE_REVIEW_URL = 'https://g.page/r/promobidocs/review'
const BASE_URL = 'https://promobidocs.com'

interface DeliveryDoc {
    name: string
    deliveryUrl: string
    pages?: number
    fileType?: string
}

interface DeliveryEmailData {
    clientName: string
    orderId: number
    totalDocs: number
    totalPages: number
    sourceLanguage: string
    emissionDate: string
    documents: DeliveryDoc[]
}

function buildDocRow(doc: DeliveryDoc, index: number): string {
    const cleanName = cleanDocumentName(doc.name)
    const subtitle = doc.pages ? `${doc.fileType || 'PDF'} &middot; ${doc.pages} pagina${doc.pages > 1 ? 's' : ''}` : ''

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td style="background:#ffffff; border:1px solid #E8D5C0; border-radius:12px; padding:16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="40" valign="top" style="padding-right:12px;">
                <table cellpadding="0" cellspacing="0" style="background:#E8F5E9; border-radius:10px; width:36px; height:36px;">
                  <tr><td align="center" valign="middle" style="color:#2D8B5F; font-size:16px;">&#10003;</td></tr>
                </table>
              </td>
              <td valign="middle">
                <p style="margin:0; font-family:Georgia,serif; font-size:14px; font-weight:bold; color:#2D2A26;">
                  ${cleanName}
                </p>
                ${subtitle ? `<p style="margin:4px 0 0; font-size:11px; color:#9C9A92;">${subtitle}</p>` : ''}
              </td>
              <td width="100" align="right" valign="middle">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#2D8B5F; border-radius:8px; padding:0;">
                      <a href="${doc.deliveryUrl}" style="display:inline-block; padding:8px 16px; color:#ffffff; font-family:Arial,sans-serif; font-size:12px; font-weight:bold; text-decoration:none;">
                        Baixar PDF
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`
}

export function buildDeliveryKitEmail(data: DeliveryEmailData): string {
    const langLabel = data.sourceLanguage === 'ES' ? 'ES &rarr; EN' : 'PT &rarr; EN'
    const docRows = data.documents.map((doc, i) => buildDocRow(doc, i)).join('')
    const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Ola, tenho uma duvida sobre o pedido #${data.orderId}`)}`

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Seu Kit de Traducao esta pronto</title>
</head>
<body style="margin:0; padding:0; background-color:#F5F1EB; font-family:Arial,Helvetica,sans-serif; color:#2D2A26; -webkit-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F1EB;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(45,42,38,0.08);">

          <!-- A. HEADER -->
          <tr>
            <td style="background:#B87333; padding:32px 40px; text-align:center; border-radius:16px 16px 0 0;">
              <img src="${BASE_URL}/logo-promobi.png" width="160" height="48" alt="Promobidocs" style="display:block; margin:0 auto 16px; height:48px; width:auto;" />
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15); border-radius:100px; padding:6px 16px;">
                    <p style="margin:0; font-size:10px; font-weight:bold; letter-spacing:2px; color:rgba(255,255,255,0.9); text-transform:uppercase;">
                      TRADUCAO CERTIFICADA &middot; USCIS ACCEPTED
                    </p>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px; font-family:Georgia,serif; font-size:26px; font-weight:bold; color:#ffffff; line-height:1.2;">
                Seu Kit de Traducao esta pronto.
              </h1>
              <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">
                Todos os documentos foram traduzidos, revisados e certificados com sucesso.
              </p>
            </td>
          </tr>

          <!-- B. STRIP DE RESUMO -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <p style="margin:0; font-family:Georgia,serif; font-size:22px; font-weight:bold; color:#2D2A26;">${data.totalDocs}</p>
                    <p style="margin:4px 0 0; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px;">Documentos</p>
                  </td>
                  <td width="4"></td>
                  <td width="25%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <p style="margin:0; font-family:Georgia,serif; font-size:22px; font-weight:bold; color:#2D2A26;">${data.totalPages}</p>
                    <p style="margin:4px 0 0; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px;">Paginas</p>
                  </td>
                  <td width="4"></td>
                  <td width="25%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <p style="margin:0; font-family:Georgia,serif; font-size:18px; font-weight:bold; color:#B87333;">${langLabel}</p>
                    <p style="margin:4px 0 0; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px;">Idioma</p>
                  </td>
                  <td width="4"></td>
                  <td width="25%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <p style="margin:0; font-family:Georgia,serif; font-size:18px; font-weight:bold; color:#2D2A26;">#${data.orderId}</p>
                    <p style="margin:4px 0 0; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px;">Pedido</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- C. SAUDACAO -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 12px; font-family:Georgia,serif; font-size:18px; color:#2D2A26;">
                Ola, ${data.clientName}!
              </p>
              <p style="margin:0; font-size:14px; line-height:1.7; color:#6B6560;">
                Seu Kit de Traducao Certificada foi finalizado com sucesso. Cada documento foi traduzido por especialistas, revisado tecnicamente e acompanha o Certificate of Accuracy, garantindo aceitacao imediata pelo USCIS, DMV, universidades e instituicoes financeiras americanas.
              </p>
            </td>
          </tr>

          <!-- D. DADOS DA CERTIFICACAO -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7; border:1px solid #E8D5C0; border-radius:12px;">
                <tr>
                  <td width="50%" style="padding:16px 20px; border-bottom:1px solid #E8D5C0; border-right:1px solid #E8D5C0;">
                    <p style="margin:0 0 4px; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">Tipo</p>
                    <p style="margin:0; font-size:13px; color:#2D2A26; font-weight:bold;">Traducao Certificada</p>
                    <p style="margin:2px 0 0; font-size:11px; color:#6B6560;">(Certificate of Accuracy)</p>
                  </td>
                  <td width="50%" style="padding:16px 20px; border-bottom:1px solid #E8D5C0;">
                    <p style="margin:0 0 4px; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">Aceita por</p>
                    <p style="margin:0; font-size:13px; color:#2D2A26; font-weight:bold;">USCIS, DMV, Universidades, Bancos</p>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:16px 20px; border-right:1px solid #E8D5C0;">
                    <p style="margin:0 0 4px; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">Equipe</p>
                    <p style="margin:0; font-size:13px; color:#2D2A26; font-weight:bold;">Tradutores especializados</p>
                  </td>
                  <td width="50%" style="padding:16px 20px;">
                    <p style="margin:0 0 4px; font-size:10px; color:#9C9A92; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">Data de emissao</p>
                    <p style="margin:0; font-size:13px; color:#2D2A26; font-weight:bold;">${data.emissionDate}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- E. LISTA DE DOCUMENTOS -->
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0 0 12px; font-size:11px; font-weight:bold; color:#9C9A92; text-transform:uppercase; letter-spacing:1.5px;">
                ${data.totalDocs} Documento${data.totalDocs > 1 ? 's' : ''} Certificado${data.totalDocs > 1 ? 's' : ''}
              </p>
              ${docRows}
            </td>
          </tr>

          <!-- G. AVISO IMPORTANTE -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#E8F5E9; border:1px solid #A5D6A7; border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32" valign="top" style="padding-right:12px; color:#2D8B5F; font-size:20px;">&#9745;</td>
                        <td>
                          <p style="margin:0 0 4px; font-size:13px; font-weight:bold; color:#1B5E20;">Importante</p>
                          <p style="margin:0; font-size:12px; line-height:1.6; color:#2E7D32;">
                            Seus documentos traduzidos acompanham o Certificate of Accuracy, atestando fidelidade ao original. O USCIS aceita versao digital &mdash; nao e necessario imprimir, a menos que o orgao solicite especificamente.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- H. PROXIMOS PASSOS -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 16px; font-family:Georgia,serif; font-size:16px; font-weight:bold; color:#2D2A26;">Proximos passos</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="36" valign="top">
                    <table cellpadding="0" cellspacing="0" style="background:#B87333; border-radius:50%; width:28px; height:28px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff; font-size:13px; font-weight:bold;">1</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left:8px;">
                    <p style="margin:0 0 2px; font-size:13px; font-weight:bold; color:#2D2A26;">Baixe seus documentos</p>
                    <p style="margin:0; font-size:12px; color:#6B6560; line-height:1.5;">Salve todos os PDFs em local seguro. Recomendamos manter uma copia no celular e outra no computador.</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="36" valign="top">
                    <table cellpadding="0" cellspacing="0" style="background:#B87333; border-radius:50%; width:28px; height:28px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff; font-size:13px; font-weight:bold;">2</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left:8px;">
                    <p style="margin:0 0 2px; font-size:13px; font-weight:bold; color:#2D2A26;">Envie junto com os originais</p>
                    <p style="margin:0; font-size:12px; color:#6B6560; line-height:1.5;">Ao submeter para o USCIS, DMV ou universidade, envie a traducao certificada acompanhada do documento original.</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                <tr>
                  <td width="36" valign="top">
                    <table cellpadding="0" cellspacing="0" style="background:#B87333; border-radius:50%; width:28px; height:28px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff; font-size:13px; font-weight:bold;">3</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left:8px;">
                    <p style="margin:0 0 2px; font-size:13px; font-weight:bold; color:#2D2A26;">Guarde para uso futuro</p>
                    <p style="margin:0; font-size:12px; color:#6B6560; line-height:1.5;">Suas traducoes certificadas nao expiram. Podem ser reutilizadas em outros processos sem necessidade de nova traducao.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- I. AVALIACAO -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E8D5C0; border-radius:12px;">
                <tr>
                  <td style="padding:20px; text-align:center;">
                    <p style="margin:0 0 8px; font-size:24px; letter-spacing:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
                    <p style="margin:0 0 4px; font-size:14px; font-weight:bold; color:#2D2A26;">Sua opiniao e muito importante para nos.</p>
                    <p style="margin:0 0 16px; font-size:12px; color:#6B6560;">Como foi sua experiencia com a Promobidocs?</p>
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:#B87333; border-radius:8px;">
                          <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block; padding:10px 24px; color:#ffffff; font-size:13px; font-weight:bold; text-decoration:none; font-family:Arial,sans-serif;">
                            Deixar avaliacao no Google &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- J. SUPORTE -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7; border:1px solid #E8D5C0; border-radius:12px;">
                <tr>
                  <td style="padding:20px; text-align:center;">
                    <p style="margin:0 0 4px; font-size:14px; font-weight:bold; color:#2D2A26;">Tem alguma duvida sobre seus documentos?</p>
                    <p style="margin:0 0 16px; font-size:12px; color:#6B6560;">Estamos aqui para ajudar.</p>
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:#25D366; border-radius:8px; padding:0; margin-right:8px;">
                          <a href="${whatsappLink}" style="display:inline-block; padding:10px 20px; color:#ffffff; font-size:12px; font-weight:bold; text-decoration:none;">
                            Falar no WhatsApp
                          </a>
                        </td>
                        <td width="8"></td>
                        <td style="border:1px solid #E8D5C0; border-radius:8px; padding:0;">
                          <a href="mailto:desk@promobidocs.com" style="display:inline-block; padding:10px 20px; color:#6B6560; font-size:12px; font-weight:bold; text-decoration:none;">
                            desk@promobidocs.com
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- K. FOOTER -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <img src="${BASE_URL}/logo-notary.png" width="36" height="36" alt="Florida Notary" style="display:block; margin:0 auto 6px; height:36px; width:auto;" />
                    <p style="margin:0; font-size:10px; color:#9C9A92; font-weight:bold;">Florida Notary Public</p>
                  </td>
                  <td width="4"></td>
                  <td width="33%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <img src="${BASE_URL}/logo-ata.png" width="36" height="36" alt="ATA Member" style="display:block; margin:0 auto 6px; height:36px; width:auto;" />
                    <p style="margin:0; font-size:10px; color:#9C9A92; font-weight:bold;">ATA Member</p>
                  </td>
                  <td width="4"></td>
                  <td width="33%" style="text-align:center; padding:12px 4px; border:1px solid #E8D5C0; border-radius:10px;">
                    <img src="${BASE_URL}/atif.png" width="36" height="36" alt="ATIF Member" style="display:block; margin:0 auto 6px; height:36px; width:auto;" />
                    <p style="margin:0; font-size:10px; color:#9C9A92; font-weight:bold;">ATIF Member</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 28px; text-align:center; border-top:1px solid #E8D5C0; margin-top:24px;">
              <p style="margin:0 0 2px; font-size:12px; font-weight:bold; color:#2D2A26;">Promobidocs Services LLC</p>
              <p style="margin:0 0 2px; font-size:11px; color:#9C9A92;">4700 Millenia Blvd, Orlando, FL 32839, USA</p>
              <p style="margin:0 0 8px; font-size:11px; color:#9C9A92;">(321) 324-5851 &middot; desk@promobidocs.com</p>
              <p style="margin:0; font-size:9px; color:#C4C2BC; line-height:1.5;">
                Este email e confidencial e destinado exclusivamente ao destinatario identificado. Os documentos anexados sao traducoes certificadas com fidelidade atestada ao original.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildDeliverySubject(orderId: number): string {
    return `Seu Kit de Traducao esta pronto — Pedido #${orderId} | Promobidocs`
}
