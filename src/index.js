const MUSCACHE_REGEX = /(https?:)?\/\/a0.muscache.com?.*/;
const cache = caches.default;

export default {
	async fetch(request, env, ctx)
	{
		const originalUrl = new URL(request.url);
		const url = `https://www.airbnb.ae${originalUrl.pathname}`;

		const response = isPageRequest(request) ?
			await fetch(url, request) :
			await fetch(request);

		const modifiedBody = new HTMLRewriter()
			.on("link", {
				async element(node)
				{
					const href = node.getAttribute("href");

					if (href && MUSCACHE_REGEX.test(href) && href.indexOf(".css") > 0)
					{
						const newHref = href.startsWith("//") ? `http:${href}` : href;
						const css = await fetchAsset(newHref, request, ctx);

						if (css)
						{
							node.replace(`<!--BELOW IS PLACED BY WORKER--><style>${css}</style>`, { html: true });
						}
					}
				}
			})
			.transform(response);

		return modifiedBody;
	}
};

async function fetchAsset(url, request, ctx)
{
	const userAgent = request.headers.get("user-agent");
	const clientAddr = request.headers.get("cf-connecting-ip");
	const browser = userAgent ? getBrowserCacheKey(userAgent) : null;
	const link = new URL(url);
	link.searchParams.set("fonts", "true");

	let cacheKey = link.href

	if (browser)
	{
		link.searchParams.set("browser", browser);
		cacheKey = link.href;
	}

	const cacheKeyRequest = new Request(cacheKey);
	const response = await cache.match(cacheKeyRequest);

	if (response)
	{
		return await response.text();
	}

	const headers = new Headers();
	headers.set(
		"user-agent",
		browser && userAgent
			? userAgent
			: `Mozilla/4.0 (compatible MSIE 8.0 Windows NT 6.0 Trident/4.0)`
	);
	headers.set("referer", request.url);

	if (clientAddr)
	{
		headers.set("X-Forwarded-For", clientAddr);
	}

	const responseFromGoogle = await fetch(url, {
		headers
	})

	if (responseFromGoogle.ok)
	{
		const css = await responseFromGoogle.text();
		const cacheResponse = new Response(css, { ttl: 86400 });
		ctx.waitUntil(cache.put(cacheKeyRequest, cacheResponse));

		return css;
	}

	return null;
}

function getBrowserCacheKey(userAgent)
{
	let os = "";
	const osRegex = /^[^(]*\(\s*(\w+)/gim;
	let match = osRegex.exec(userAgent);

	if (match)
	{
		os = match[1];
	}

	let mobile = "";

	if (userAgent.match(/Mobile/gim))
	{
		mobile = "Mobile";
	}

	// Detect Edge first since it includes Chrome and Safari
	const edgeRegex = /\s+Edge\/(\d+)/gim;
	match = edgeRegex.exec(userAgent);

	if (match)
	{
		return "Edge" + match[1] + os + mobile;
	}

	// Detect Chrome next (and browsers using the Chrome UA/engine)
	const chromeRegex = /\s+Chrome\/(\d+)/gim;
	match = chromeRegex.exec(userAgent);

	if (match)
	{
		return "Chrome" + match[1] + os + mobile;
	}

	// Detect Safari and Webview next
	const webkitRegex = /\s+AppleWebKit\/(\d+)/gim;
	match = webkitRegex.exec(userAgent);

	if (match)
	{
		return "WebKit" + match[1] + os + mobile;
	}

	// Detect Firefox
	const firefoxRegex = /\s+Firefox\/(\d+)/gim;
	match = firefoxRegex.exec(userAgent);

	if (match)
	{
		return "Firefox" + match[1] + os + mobile;
	}

	return null;
}

async function isPageRequest(request)
{
	if (request.method === "GET" &&
		request.headers.get("accept")?.includes("text/html") &&
		!MUSCACHE_REGEX.test(originalUrl.pathname))
	{
		return true
	}

	return false
}