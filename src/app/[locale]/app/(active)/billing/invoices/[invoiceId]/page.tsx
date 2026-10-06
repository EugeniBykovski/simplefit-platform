import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.billing.invoices._invoice-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
