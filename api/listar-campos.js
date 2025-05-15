export default async function handler(req, res) {
  const CLIENT_ID = process.env.MC_CLIENT_ID;
  const CLIENT_SECRET = process.env.MC_CLIENT_SECRET;
  const AUTH_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.auth.marketingcloudapis.com/v2/token";
  const REST_URL = "https://mcj90l2mmyz5mnccv2qp30ywn8r0.rest.marketingcloudapis.com";
  const DE_NAME = "709E1D62-BDA9-4706-ABBD-133C113727B5";

  try {
    // 1. Obtener token
    const tokenRes = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error("No se pudo obtener el token");

    // 2. Buscar el DE por nombre
    const searchRes = await fetch(`${REST_URL}/data/v1/customobjectdata/key/${DE_NAME}/rowset`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    const sampleData = await searchRes.json();
    const firstRow = sampleData.items?.[0];

    if (!firstRow) {
      return res.status(200).json({ mensaje: "No se encontraron registros para inspeccionar." });
    }

    const campos = Object.keys(firstRow.keys || {}).concat(Object.keys(firstRow.values || {}));

    return res.status(200).json({
      campos: [...new Set(campos)].sort(),
      totalDetectados: campos.length,
    });
  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
