import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.payments._payment-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
