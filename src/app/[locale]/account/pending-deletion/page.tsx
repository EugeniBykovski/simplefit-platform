import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.account.pending-deletion");

export const generateMetadata = route.generateMetadata;
export default route.Page;
