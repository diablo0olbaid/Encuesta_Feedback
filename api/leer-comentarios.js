import pkg from "fast-xml-parser";
const { XMLParser } = pkg;

export default async function handler(req, res) {
  const CLIENT_ID = process.env.MC_CLIENT_ID;
  const CLIENT_SECRET = process.env.MC_CLIENT_SECRET;
  const AUTH_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.auth.marketingcloudapis.com/v2/token";
  const SOAP_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.soap.marketingcloudapis.com/Service.asmx";
  const DE_NAME = "Encuesta_Feedback";

  try {
    // 1. Obtener access token
    const tokenRes = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Error al obtener token:", tokenData);
      return res.status(500).json({ error: "Error al obtener token", details: tokenData });
    }

    const { access_token } = tokenData;

    // 2. Armar envelope SOAP
   const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soapenv:Header>
    <fueloauth>${access_token}</fueloauth>
  </soapenv:Header>
  <soapenv:Body>
    <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <RetrieveRequest>
        <ObjectType>DataExtensionObject[${DE_NAME}]</ObjectType>
        <Properties>Email</Properties>
        <Properties>Comentario</Properties>
        <Properties>Motivo</Properties>
        <Properties>FechaForm_Arg</Properties>
      </RetrieveRequest>
    </RetrieveRequestMsg>
  </soapenv:Body>
</soapenv:Envelope>`;

    // 3. Enviar solicitud SOAP
    const soapRes = await fetch(SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        SOAPAction: "Retrieve",
      },
      body: envelope,
    });

    const xml = await soapRes.text();
    console.log("SOAP RESPONSE:\n", xml); // Log para Vercel

    // 4. Parsear respuesta XML
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const results = parsed?.["soap:Envelope"]?.["soap:Body"]?.["RetrieveResponseMsg"]?.["Results"];

    if (!results) {
      console.warn("Sin resultados.");
      return res.status(200).json([]);
    }

    const normalizados = Array.isArray(results) ? results.map(normalizar) : [normalizar(results)];

    function normalizar(entry) {
      const props = entry.Properties.Property;
      const obj = {};
      props.forEach(p => {
        obj[p.Name] = p.Value;
      });
      return obj;
    }

    return res.status(200).json(normalizados);
  } catch (err) {
    console.error("ERROR GENERAL:", err);
    return res.status(500).json({
      error: "Error al leer registros de SFMC",
      message: err.message,
      stack: err.stack,
    });
  }
}
