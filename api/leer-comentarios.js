import pkg from "fast-xml-parser";
const { XMLParser } = pkg;

export default async function handler(req, res) {
  const CLIENT_ID = process.env.MC_CLIENT_ID;
  const CLIENT_SECRET = process.env.MC_CLIENT_SECRET;
  const AUTH_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.auth.marketingcloudapis.com/v2/token";
  const SOAP_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.soap.marketingcloudapis.com/Service.asmx";
  const DE_NAME = "Encuesta_Feedback";

  const LIMIT = parseInt(req.query.limit || "0", 10); // ?limit=100

  try {
    // Obtener access token
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
    if (!tokenRes.ok) throw new Error("Error al obtener token: " + JSON.stringify(tokenData));
    const access_token = tokenData.access_token;

    const parser = new XMLParser({ ignoreAttributes: false });
    let allResults = [];

    // === 1. PRIMERA LLAMADA ===
    const firstEnvelope = generateRetrieveEnvelope(access_token, DE_NAME);
    let response = await fetch(SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        SOAPAction: "Retrieve",
      },
      body: firstEnvelope,
    });

    let xml = await response.text();
    let parsed = parser.parse(xml);
    let root = parsed["soap:Envelope"]["soap:Body"]["RetrieveResponseMsg"];
    let results = root.Results;
    let moreData = root.OverallStatus === "MoreDataAvailable";
    let requestID = root.RequestID;

    if (results) {
      const normalized = Array.isArray(results) ? results.map(normalizar) : [normalizar(results)];
      allResults.push(...normalized);
    }

    // === 2. CONTINUAR SI HAY MÁS ===
    while (moreData && requestID) {
      const continueEnvelope = generateContinueEnvelope(access_token, requestID);
      const continueRes = await fetch(SOAP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
          SOAPAction: "Retrieve",
        },
        body: continueEnvelope,
      });

      const xmlCont = await continueRes.text();
      const parsedCont = parser.parse(xmlCont);
      const contRoot = parsedCont["soap:Envelope"]["soap:Body"]["RetrieveResponseMsg"];

      const contResults = contRoot.Results;
      moreData = contRoot.OverallStatus === "MoreDataAvailable";
      requestID = contRoot.RequestID;

      if (contResults) {
        const normalized = Array.isArray(contResults) ? contResults.map(normalizar) : [normalizar(contResults)];
        allResults.push(...normalized);
      }
    }

    // === 3. LIMITE OPCIONAL ===
    if (LIMIT > 0) {
      allResults = allResults.slice(-LIMIT);
    }

    return res.status(200).json(allResults);
  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({ error: "Error al recuperar comentarios", message: err.message });
  }

  function generateRetrieveEnvelope(token, deName) {
    return `<?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth>${token}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataExtensionObject[${deName}]</ObjectType>
              <Properties>Email</Properties>
              <Properties>Comentario</Properties>
              <Properties>Motivo</Properties>
              <Properties>FechaForm_Arg</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>`;
  }

  function generateContinueEnvelope(token, requestId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth>${token}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ContinueRequest>${requestId}</ContinueRequest>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>`;
  }

  function normalizar(entry) {
    const props = entry.Properties?.Property || [];
    const obj = {};
    props.forEach(p => {
      obj[p.Name] = p.Value;
    });
    return obj;
  }
}
