# Cloudflare worker for Edge Delivery Services

Extension of Cloudflare worker template https://github.com/adobe/helix-cloudflare-prod-worker-template as described here https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup 
It used on this website https://www.scaus.art/ 

Some improvements :

 * Added First Party ID Generation (which will keep Cookies longer for some browsers - Apple Safari ITP limits to 7 days) - read more about it here https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/identity/first-party-device-ids , AEM Servlet approach described here https://experienceleague.adobe.com/en/docs/experience-manager-learn/sites/integrations/experience-platform/fpid 
 * 
