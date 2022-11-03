import json
import os.path
import time

import shapely
from shapely.geometry import LineString, Point
from tqdm import tqdm
import numpy as np
import pandas as pd

import geopandas

tqdm.pandas()

TARGET_PROJ_EPSG_CODE = "2230"  # NAD83 / CA 6
TARGET_PROJ_IS_FT_US = True
INTERPOLATION_DISTANCE_METERS = 5  # the distance between interpolated points in meters
LINE_PAD_DISTANCE_METERS = 0.1  # how much to pad the line by to make sure we don't get duplicate points at intersections
MIN_LINE_LENGTH_METERS = 1  # meters
USE_CACHE = False
USE_SUBSET = False
WRITE_DEBUG_SHAPEFILES = False
xmin = -117.186
ymin = 32.692
xmax = -117.129
ymax = 32.741

# convert the constants to the target projection
CONVERSION = 0.3048 if TARGET_PROJ_IS_FT_US else 1
INTERPOLATION_DISTANCE = INTERPOLATION_DISTANCE_METERS / CONVERSION
LINE_PAD_DISTANCE = 0.1 / CONVERSION
MIN_LINE_LENGTH = 1 / CONVERSION


def split_line(row):
    line = row['geometry']
    # pad the line to avoid duplicate points
    target_length = line.length - LINE_PAD_DISTANCE * 2
    distances = np.arange(LINE_PAD_DISTANCE, target_length, INTERPOLATION_DISTANCE)
    distances = np.append(distances, [target_length - LINE_PAD_DISTANCE])
    if len(distances) < 2:
        # print geojson of line
        print(row.name)
        print(line.length, target_length, distances)
    points = [line.interpolate(distance) for distance in distances]
    return LineString(points)


# Load the data, convert to target projection for shapely, then interpolate points
def load_roads_from_file():
    if os.path.exists('/conflator-cache/final.pickle') and USE_CACHE:
        return pd.read_pickle('/conflator-cache/final.pickle')

    if os.path.exists('/conflator-cache/ref.pickle'):
        print('loading roads from pickle')
        df = pd.read_pickle('/conflator-cache/ref.pickle')
    else:
        start = time.process_time()
        df = geopandas.read_file('data/ref/ref.shp')
        df = df.to_crs('EPSG:4326')
        df = df.set_index('ROADSEGID')
        df.to_pickle('/conflator-cache/ref.pickle')
        print('loaded shapefile in {} seconds'.format(time.process_time() - start))

    if USE_SUBSET:
        df = df.cx[xmin:xmax, ymin:ymax]
        print('subset to {} roads'.format(len(df)))

    total_points_count = df['geometry'].apply(lambda x: len(x.coords)).sum()
    print('total points: {}'.format(total_points_count))

    if os.path.exists(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}.pickle') and USE_CACHE:
        print(f'loading EPSG:{TARGET_PROJ_EPSG_CODE} roads from pickle')
        df = pd.read_pickle(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}.pickle')
    else:
        start = time.process_time()
        df = df.to_crs(TARGET_PROJ_EPSG_CODE)
        df.to_pickle(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}.pickle')
        print('converted to EPSG:{} in {} seconds'.format(TARGET_PROJ_EPSG_CODE, time.process_time() - start))

    # remove roads that are too short and show how many were removed
    orig_len = df.shape[0]
    df = df[df['geometry'].apply(lambda x: x.length) > MIN_LINE_LENGTH]
    print('removed {} roads that were too short'.format(orig_len - df.shape[0]))

    # make points every INTERPOLATION_DISTANCE meters evenly along the line
    if os.path.exists(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}_split.pickle') and USE_CACHE:
        print(f'loading split EPSG:{TARGET_PROJ_EPSG_CODE} roads from pickle')
        df = pd.read_pickle(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}_split.pickle')
    else:
        start = time.process_time()
        df['geometry'] = df.progress_apply(lambda row: split_line(row), axis=1)
        df.to_pickle(f'/conflator-cache/ref_{TARGET_PROJ_EPSG_CODE}_split.pickle')
        print('interpolated points in {} seconds'.format(time.process_time() - start))

    total_points_count = df['geometry'].apply(lambda x: len(x.coords)).sum()
    print('total points: {}'.format(total_points_count))

    # reproject to wgs84 for geojson
    df = df.to_crs('EPSG:4326')

    # write to shapefile
    if WRITE_DEBUG_SHAPEFILES:
        df.drop(columns=['POSTDATE', 'ADDSEGDT']).to_file('data/interpolated/shp.shp')

    points_dict = {}
    for index, row in tqdm(df.iterrows(), total=df.shape[0]):
        # if len(points_dict) > 5569564:
        #     print(index, row['geometry'], len(points_dict))
        for point in row['geometry'].coords:
            if point not in points_dict:
                points_dict[point] = []
            points_dict[point].append(index)
    # get just points that have multiple ids
    dup_points_dict = {k: v for k, v in points_dict.items() if len(v) > 1}
    print('found {} duplicate points'.format(len(dup_points_dict)))
    # remove coords from lines that are duplicates
    # for index, row in tqdm(df.iterrows(), total=len(df), desc='removing duplicate points'):
    #     orig_len = len(row['geometry'].coords)
    #     coords = row['geometry'].coords
    #     coords = [c for c in coords if c not in dup_points_dict]
    #     print('removed {} points from road {}'.format(orig_len - len(coords), index))
    #     if len(coords) < 2:
    #         print(index, coords, row['LENGTH'])
    #     else:
    #         df.at[index, 'geometry'] = LineString(coords)
    # write to shapefile
    if WRITE_DEBUG_SHAPEFILES:
        df.drop(columns=['POSTDATE', 'ADDSEGDT']).to_file('data/split_no_dup/shp.shp')


    df.to_pickle('/conflator-cache/final.pickle')
    return df
