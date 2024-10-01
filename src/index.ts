import { v4 as uuidv4 } from 'uuid';
const { createAepEdgeClient, getAepEdgeClusterCookie, getDebugSessionCookie, getAepEdgeCookies, requestAepEdgePersonalization } = require("./aepEdgeClient");
'use strict';

const ORGANIZATION_ID = 'B504732B5D3B2A790A495ECF'
const DATASTREAM_ID = '96f1c7b0-9607-404a-a6c3-a1e71445a99f'

const handleRequest = async (request, env, ctx) => {
  const url = new URL(request.url);
  if (url.port) {
    // Cloudflare opens a couple more ports than 443, so we redirect visitors
    // to the default port to avoid confusion. 
    // https://developers.cloudflare.com/fundamentals/reference/network-ports/#network-ports-compatible-with-cloudflares-proxy
    const redirectTo = new URL(request.url);
    redirectTo.port = '';
    return new Response("Moved permanently to " + redirectTo.href, {
      status: 301,
      headers: {
        location: redirectTo.href
      }
    });
  }
  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  let strippedQS;
  if (url.search && !url.pathname.match(/\.[0-9a-z]+$/i)) {
    // extensionless request w/ query string: strip query string
    strippedQS = url.search;
    url.search = '';
  }

  url.hostname = env.ORIGIN_HOSTNAME;
  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  // set the following header if push invalidation is configured
  // (see https://www.hlx.live/docs/setup-byo-cdn-push-invalidation#cloudflare)
  req.headers.set('x-push-invalidation', 'enabled');
  let resp = await fetch(req, {
    cf: {
      // cf doesn't cache html by default: need to override the default behavior
      cacheEverything: true,
    },
  });
  resp = new Response(resp.body, resp);
  if (resp.status === 301 && strippedQS) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set('location', `${location}${strippedQS}`);
    }
  }
  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');

  // FPID
  resp = await handleFpidCookie(request, resp, env.FPID_NAME);

  // Hybrid personalization 
  if (env.HYBRID_PERSONALIZATION_ENABLED){
    return await hybridPersonalization(req, resp)
  }

  return resp;

};


// Function to handle FPID cookie logic
async function handleFpidCookie(request, response, fpidCookieName) {
  const cookieHeader = request.headers.get('Cookie');

  if (!cookieHeader || !cookieHeader.includes(`${fpidCookieName}=`)) {
    // If fpid cookie is not present, generate a new one
    const { v4: uuidv4 } = require('uuid');
    const newFpid = uuidv4();

    // Set the new fpid cookie with a 1-year expiration time
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    const expires = expirationDate.toUTCString();

    response = new Response(response.body, response);
    response.headers.append('Set-Cookie', `${fpidCookieName}=${newFpid}; Expires=${expires}; Path=/; HttpOnly; Secure`);
  } else {
    // If fpid cookie exists, extend its expiration by 1 year
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    const expires = expirationDate.toUTCString();

    const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
    const fpidCookie = cookies.find(cookie => cookie.startsWith(`${fpidCookieName}=`));
    const currentFpid = fpidCookie.split('=')[1];

    response = new Response(response.body, response);
    response.headers.append('Set-Cookie', `${fpidCookieName}=${currentFpid}; Expires=${expires}; Path=/; HttpOnly; Secure`);
  }


  return response;
}

class ElementHandler {
  element(element) {
    // An incoming element, such as `div`
    console.log(`Incoming element: ${element.tagName}`);
  }


}

const hybridPersonalization = async (req, resp) => {
  // measure how much this impacts total processing time
  // move request upfront in parallel await Promise.allSettled(hybrid / cac)
  // make request on configured pages only?
  // refactor from commonjs

  const aepEdgeClient = createAepEdgeClient(
    DATASTREAM_ID,
    getAepEdgeClusterCookie(ORGANIZATION_ID, req),
    undefined,
    getDebugSessionCookie(ORGANIZATION_ID, req)
  );

  const aepEdgeCookies = getAepEdgeCookies(req);

  const identityMap = {}

  const aepEdgeResult = await requestAepEdgePersonalization(
    aepEdgeClient,
    req,
    [],
    identityMap,
    aepEdgeCookies,
    [])

    console.log("----- filter payload.type = personalization:decisions and state:store")
    console.log(JSON.stringify(aepEdgeResult.response))

    const rewriter = new HTMLRewriter()
        .on('body', {
          element(element) {
            element.append(`
              <script>
                console.log('Injected script!');
                ${aepEdgeResult.response.body}
              </script>
            `, { html: true });
          }
        });

    // Return the modified response
    return rewriter.transform(resp);

}

export default {
  fetch: handleRequest,
};