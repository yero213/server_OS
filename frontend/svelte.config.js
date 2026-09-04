import adapter from "@sveltejs/adapter-static";

/** Static build served by Caddy from /srv/serveros/frontend. */
const config = {
  kit: {
    adapter: adapter({ pages: "build", assets: "build", fallback: undefined }),
  },
};

export default config;
