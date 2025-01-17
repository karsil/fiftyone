import { graphql } from "react-relay";

export default graphql`
  query mainSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    sample(dataset: $dataset, view: $view, filter: $filter) {
      ... on ImageSample {
        id
        sample
        urls {
          field
          url
        }
      }
      ... on VideoSample {
        id
        sample
        frameRate
        urls {
          field
          url
        }
      }
    }
  }
`;
