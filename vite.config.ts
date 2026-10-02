import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vinext({
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  // Workers built-in — must be external for all server environments (vinext/Workers)
  ssr: { external: ["cloudflare:workers"] },
  environments: {
    rsc: { build: { rolldownOptions: { external: ["cloudflare:workers"] } } },
    ssr: { build: { rolldownOptions: { external: ["cloudflare:workers"] } } },
  },
});
