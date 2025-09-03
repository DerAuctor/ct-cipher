import { Mistral } from "@mistralai/mistralai"; 

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY }); 

client.embeddings.create({ 
    model: "codestral-embed", 
    inputs: ["test"], 
    output_dimension: 3072 
}).then(r => console.log("SUCCESS - Dimensions:", r.data[0].embedding.length)).catch(e => console.error("ERROR:", e.message));